import * as clc from "cli-color";

import Queue from "../../throttler/queue";
import { logger } from "../../logger";
import { RegionalFunctionChanges } from "./deploymentPlanner";
import { OperationResult, OperationPollerOptions, pollOperation } from "../../operation-poller";
import { functionsOrigin, functionsV2Origin } from "../../api";
import { getHumanFriendlyRuntimeName } from "./parseRuntimeAndValidateSDK";
import { deleteTopic } from "../../gcp/pubsub";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";
import * as backend from "./backend";
import * as cloudscheduler from "../../gcp/cloudscheduler";
import * as deploymentTool from "../../deploymentTool";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as cloudrun from "../../gcp/run";
import * as helper from "./functionsDeployHelper";
import * as utils from "../../utils";

interface PollerOptions {
  apiOrigin: string;
  apiVersion: string;
  masterTimeout: number;
}

// TODO: Tune this for better performance.
const gcfV1PollerOptions = {
  apiOrigin: functionsOrigin,
  apiVersion: gcf.API_VERSION,
  masterTimeout: 25 * 60 * 1000, // 25 minutes is the maximum build time for a function
};

const gcfV2PollerOptions = {
  apiOrigin: functionsV2Origin,
  apiVersion: gcfV2.API_VERSION,
  masterTimeout: 25 * 60 * 1000, // 25 minutes is the maximum build time for a function
};

const pollerOptionsByVersion = {
  1: gcfV1PollerOptions,
  2: gcfV2PollerOptions,
};

export type OperationType =
  | "create"
  | "update"
  | "delete"
  | "upsert schedule"
  | "delete schedule"
  | "delete topic"
  | "make public";

export interface DeploymentTask {
  run: () => Promise<void>;
  fn: backend.TargetIds;
  operationType: OperationType;
}

export interface TaskParams {
  projectId: string;
  runtime?: backend.Runtime;
  sourceUrl?: string;
  storageSource?: gcfV2.StorageSource;
  errorHandler: ErrorHandler;
}

/**
 * Cloud Functions Deployments Tasks and Handler
 */

export function createFunctionTask(
  params: TaskParams,
  fn: backend.FunctionSpec,
  sourceToken?: string,
  onPoll?: (op: OperationResult<backend.FunctionSpec>) => void
): DeploymentTask {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "creating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn)) +
        "..."
    );
    let op: { name: string };
    if (fn.apiVersion === 1) {
      const apiFunction = backend.toGCFv1Function(fn, params.sourceUrl!);
      if (sourceToken) {
        apiFunction.sourceToken = sourceToken;
      }
      op = await gcf.createFunction(apiFunction);
    } else {
      const apiFunction = backend.toGCFv2Function(fn, params.storageSource!);
      op = await gcfV2.createFunction(apiFunction);
    }
    const cloudFunction = await pollOperation<unknown>({
      ...pollerOptionsByVersion[fn.apiVersion],
      pollerName: `create-${fnName}`,
      operationResourceName: op.name,
      onPoll,
    });
    if (!backend.isEventTrigger(fn.trigger)) {
      try {
        if (fn.apiVersion == 1) {
          await gcf.setIamPolicy({
            name: fnName,
            policy: gcf.DEFAULT_PUBLIC_POLICY,
          });
        } else {
          const serviceName = (cloudFunction as gcfV2.CloudFunction).serviceConfig.service!;
          cloudrun.setIamPolicy(serviceName, cloudrun.DEFAULT_PUBLIC_POLICY);
        }
      } catch (err) {
        params.errorHandler.record("warning", fnName, "make public", err.message);
      }
    }
  };
  return {
    run,
    fn,
    operationType: "create",
  };
}

export function updateFunctionTask(
  params: TaskParams,
  fn: backend.FunctionSpec,
  sourceToken?: string,
  onPoll?: (op: OperationResult<gcf.CloudFunction>) => void
): DeploymentTask {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "updating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn)) +
        "..."
    );

    let opName;
    if (fn.apiVersion == 1) {
      const apiFunction = backend.toGCFv1Function(fn, params.sourceUrl!);
      if (sourceToken) {
        apiFunction.sourceToken = sourceToken;
      }
      opName = (await gcf.updateFunction(apiFunction)).name;
    } else {
      const apiFunction = backend.toGCFv2Function(fn, params.storageSource!);
      opName = (await gcfV2.updateFunction(apiFunction)).name;
    }
    const pollerOptions: OperationPollerOptions = {
      ...pollerOptionsByVersion[fn.apiVersion],
      pollerName: `update-${fnName}`,
      operationResourceName: opName,
      onPoll,
    };
    await pollOperation<void>(pollerOptions);
  };
  return {
    run,
    fn,
    operationType: "update",
  };
}

export function deleteFunctionTask(params: TaskParams, fn: backend.FunctionSpec): DeploymentTask {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "deleting function " +
        clc.bold(helper.getFunctionLabel(fnName)) +
        "..."
    );
    let res: { name: string };
    if (fn.apiVersion == 1) {
      res = await gcf.deleteFunction(fnName);
    } else {
      res = await gcfV2.deleteFunction(fnName);
    }
    const pollerOptions: OperationPollerOptions = {
      ...pollerOptionsByVersion[fn.apiVersion],
      pollerName: `delete-${fnName}`,
      operationResourceName: res.name,
    };
    await pollOperation<void>(pollerOptions);
  };
  return {
    run,
    fn,
    operationType: "delete",
  };
}

export function functionsDeploymentHandler(
  timer: DeploymentTimer,
  errorHandler: ErrorHandler
): (task: DeploymentTask) => Promise<any | undefined> {
  return async (task: DeploymentTask) => {
    let result;
    const fnName = backend.functionName(task.fn);
    try {
      timer.startTimer(fnName, task.operationType);
      result = await task.run();
      helper.printSuccess(task.fn, task.operationType);
    } catch (err) {
      if (err.original?.context?.response?.statusCode === 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      }
      errorHandler.record("error", fnName, task.operationType, err.original?.message || "");
    }
    timer.endTimer(fnName);
    return result;
  };
}

/**
 * Adds tasks to execute all function creates and updates for a region to the provided queue.
 */
export async function runRegionalFunctionDeployment(
  params: TaskParams,
  region: string,
  regionalDeployment: RegionalFunctionChanges,
  queue: Queue<DeploymentTask, void>
): Promise<void> {
  let resolveToken: (token: string | undefined) => void;
  const getRealToken = new Promise<string | undefined>((resolve) => (resolveToken = resolve));
  let firstToken = true;
  const getToken = (): Promise<string | undefined> => {
    // The first time we get a token, it must be undefined.
    // After that we'll get it from the operation promise.
    if (firstToken) {
      firstToken = false;
      return Promise.resolve(undefined);
    }
    return getRealToken;
  };

  // On operation poll (for a V1 function) we may get a source token. If we get a source token or if
  // GCF isn't returning one for some reason, resolve getRealToken to unblock deploys that are waiting
  // for the source token.
  // This function should not be run with a GCF version that doesn't support sourceTokens or else we will
  // call resolveToken(undefined)
  const onPollFn = (op: any) => {
    if (op.metadata?.sourceToken || op.done) {
      logger.debug(`Got sourceToken ${op.metadata.sourceToken} for region ${region}`);
      resolveToken(op.metadata?.sourceToken);
    }
  };

  const deploy = async (functionSpec: backend.FunctionSpec, createTask: Function) => {
    functionSpec.labels = {
      ...(functionSpec.labels || {}),
      ...deploymentTool.labels(),
    };
    let task: DeploymentTask;
    // GCF v2 doesn't support tokens yet. If we were to pass onPoll to a GCFv2 function, then
    // it would complete deployment and resolve the getRealToken promies as undefined.
    if (functionSpec.apiVersion == 2) {
      task = createTask(
        params,
        functionSpec,
        /* sourceToken= */ undefined,
        /* onPoll= */ () => undefined
      );
    } else {
      const sourceToken = await getToken();
      task = createTask(params, functionSpec, sourceToken, onPollFn);
    }
    return queue.run(task);
  };

  const deploys: Promise<void>[] = [];
  deploys.push(...regionalDeployment.functionsToCreate.map((fn) => deploy(fn, createFunctionTask)));
  deploys.push(...regionalDeployment.functionsToUpdate.map((fn) => deploy(fn, updateFunctionTask)));

  await Promise.all(deploys);
}

/**
 * Cloud Scheduler Deployments Tasks and Handler
 */

export function upsertScheduleTask(
  params: TaskParams,
  schedule: backend.ScheduleSpec,
  appEngineLocation: string
): DeploymentTask {
  const run = async () => {
    const job = backend.toJob(schedule, appEngineLocation);
    await cloudscheduler.createOrReplaceJob(job);
  };
  return {
    run,
    fn: schedule.targetService,
    operationType: "upsert schedule",
  };
}

export function deleteScheduleTask(
  params: TaskParams,
  schedule: backend.ScheduleSpec,
  appEngineLocation: string
): DeploymentTask {
  const run = async () => {
    const jobName = backend.scheduleName(schedule, appEngineLocation);
    await cloudscheduler.deleteJob(jobName);
  };
  return {
    run,
    fn: schedule.targetService,
    operationType: "delete schedule",
  };
}

export function deleteTopicTask(params: TaskParams, topic: backend.PubSubSpec): DeploymentTask {
  const run = async () => {
    const topicName = backend.topicName(topic);
    await deleteTopic(topicName);
  };
  return {
    run,
    fn: topic.targetService,
    operationType: "delete topic",
  };
}

export const schedulerDeploymentHandler = (errorHandler: ErrorHandler) => async (
  task: DeploymentTask
): Promise<void> => {
  try {
    const result = await task.run();
    helper.printSuccess(task.fn, task.operationType);
    return result;
  } catch (err) {
    if (err.status === 429) {
      // Throw quota errors so that throttler retries them.
      throw err;
    } else if (err.status !== 404) {
      // Ignore 404 errors from scheduler calls since they may be deleted out of band.
      errorHandler.record(
        "error",
        backend.functionName(task.fn),
        task.operationType,
        err.message || ""
      );
    }
  }
};
