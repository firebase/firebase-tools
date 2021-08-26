import * as clc from "cli-color";

import Queue from "../../throttler/queue";
import { logger } from "../../logger";
import { RegionalFunctionChanges } from "./deploymentPlanner";
import { OperationResult, OperationPollerOptions, pollOperation } from "../../operation-poller";
import { functionsOrigin, functionsV2Origin } from "../../api";
import { getHumanFriendlyRuntimeName } from "./runtimes";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";
import * as backend from "./backend";
import * as cloudscheduler from "../../gcp/cloudscheduler";
import * as deploymentTool from "../../deploymentTool";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as cloudrun from "../../gcp/run";
import * as helper from "./functionsDeployHelper";
import * as pubsub from "../../gcp/pubsub";
import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { track } from "../../track";

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

const pollerOptionsByPlatform: Record<backend.FunctionsPlatform, PollerOptions> = {
  gcfv1: gcfV1PollerOptions,
  gcfv2: gcfV2PollerOptions,
};

export type OperationType =
  | "create"
  | "update"
  | "delete"
  | "upsert schedule"
  | "delete schedule"
  | "delete topic"
  | "set invoker";

export interface DeploymentTask<T> {
  run: () => Promise<void>;
  data: T;
  operationType: OperationType;
}

export interface TaskParams {
  projectId: string;
  sourceUrl?: string;
  storage?: Record<string, gcfV2.StorageSource>;
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
): DeploymentTask<backend.FunctionSpec> {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "creating " +
        getHumanFriendlyRuntimeName(fn.runtime) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn)) +
        "..."
    );
    let op: { name: string };
    if (fn.platform === "gcfv1") {
      const apiFunction = gcf.functionFromSpec(fn, params.sourceUrl!);
      if (sourceToken) {
        apiFunction.sourceToken = sourceToken;
      }
      op = await gcf.createFunction(apiFunction);
    } else {
      const apiFunction = gcfV2.functionFromSpec(fn, params.storage![fn.region]);
      // N.B. As of GCFv2 private preview GCF no longer creates Pub/Sub topics
      // for Pub/Sub event handlers. This may change, at which point this code
      // could be deleted.
      if (apiFunction.eventTrigger?.pubsubTopic) {
        try {
          await pubsub.getTopic(apiFunction.eventTrigger.pubsubTopic);
        } catch (err) {
          if (err.status !== 404) {
            throw new FirebaseError("Unexpected error looking for Pub/Sub topic", {
              original: err,
            });
          }
          await pubsub.createTopic({
            name: apiFunction.eventTrigger.pubsubTopic,
          });
        }
      }
      op = await gcfV2.createFunction(apiFunction);
    }
    const cloudFunction = await pollOperation<unknown>({
      ...pollerOptionsByPlatform[fn.platform],
      pollerName: `create-${fnName}`,
      operationResourceName: op.name,
      onPoll,
    });
    if (!backend.isEventTrigger(fn.trigger)) {
      const invoker = fn.trigger.invoker || ["public"];
      if (invoker[0] !== "private") {
        try {
          if (fn.platform === "gcfv1") {
            await gcf.setInvokerCreate(params.projectId, fnName, invoker);
          } else {
            const serviceName = (cloudFunction as gcfV2.CloudFunction).serviceConfig.service!;
            cloudrun.setInvokerCreate(params.projectId, serviceName, invoker);
          }
        } catch (err) {
          params.errorHandler.record("error", fnName, "set invoker", err.message);
        }
      }
    }
    if (fn.platform !== "gcfv1") {
      // GCFv2 has a default concurrency of 1, but CF3 has a default concurrency of 80.
      await setConcurrency(
        (cloudFunction as gcfV2.CloudFunction).serviceConfig.service!,
        fn.concurrency || 80
      );
    }
  };
  return {
    run,
    data: fn,
    operationType: "create",
  };
}

export function updateFunctionTask(
  params: TaskParams,
  fn: backend.FunctionSpec,
  sourceToken?: string,
  onPoll?: (op: OperationResult<gcf.CloudFunction>) => void
): DeploymentTask<backend.FunctionSpec> {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "updating " +
        getHumanFriendlyRuntimeName(fn.runtime) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn)) +
        "..."
    );

    let opName;
    if (fn.platform == "gcfv1") {
      const apiFunction = gcf.functionFromSpec(fn, params.sourceUrl!);
      if (sourceToken) {
        apiFunction.sourceToken = sourceToken;
      }
      opName = (await gcf.updateFunction(apiFunction)).name;
    } else {
      const apiFunction = gcfV2.functionFromSpec(fn, params.storage![fn.region]);
      // N.B. As of GCFv2 private preview the API chokes on any update call that
      // includes the pub/sub topic even if that topic is unchanged.
      // We know that the user hasn't changed the topic between deploys because
      // of checkForInvalidChangeOfTrigger().
      if (apiFunction.eventTrigger?.pubsubTopic) {
        delete apiFunction.eventTrigger.pubsubTopic;
      }
      opName = (await gcfV2.updateFunction(apiFunction)).name;
    }
    const pollerOptions: OperationPollerOptions = {
      ...pollerOptionsByPlatform[fn.platform],
      pollerName: `update-${fnName}`,
      operationResourceName: opName,
      onPoll,
    };
    const cloudFunction = await pollOperation<unknown>(pollerOptions);
    if (!backend.isEventTrigger(fn.trigger) && fn.trigger.invoker) {
      try {
        if (fn.platform === "gcfv1") {
          await gcf.setInvokerUpdate(params.projectId, fnName, fn.trigger.invoker);
        } else {
          const serviceName = (cloudFunction as gcfV2.CloudFunction).serviceConfig.service!;
          cloudrun.setInvokerUpdate(params.projectId, serviceName, fn.trigger.invoker);
        }
      } catch (err) {
        params.errorHandler.record("error", fnName, "set invoker", err.message);
      }
    }

    if ("concurrency" in fn) {
      if (fn.platform === "gcfv1") {
        throw new FirebaseError("Precondition failed: GCFv1 does not support concurrency");
      } else {
        await setConcurrency(
          (cloudFunction as gcfV2.CloudFunction).serviceConfig.service!,
          fn.concurrency || 80
        );
      }
    }
  };
  return {
    run,
    data: fn,
    operationType: "update",
  };
}

export function deleteFunctionTask(
  params: TaskParams,
  fn: backend.FunctionSpec
): DeploymentTask<backend.FunctionSpec> {
  const fnName = backend.functionName(fn);
  const run = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "deleting function " +
        clc.bold(helper.getFunctionLabel(fnName)) +
        "..."
    );
    let res: { name: string };
    if (fn.platform == "gcfv1") {
      res = await gcf.deleteFunction(fnName);
    } else {
      res = await gcfV2.deleteFunction(fnName);
    }
    const pollerOptions: OperationPollerOptions = {
      ...pollerOptionsByPlatform[fn.platform],
      pollerName: `delete-${fnName}`,
      operationResourceName: res.name,
    };
    await pollOperation<void>(pollerOptions);
  };
  return {
    run,
    data: fn,
    operationType: "delete",
  };
}

async function setConcurrency(name: string, concurrency: number) {
  const err: any = null;
  while (true) {
    const service = await cloudrun.getService(name);

    delete service.status;
    delete (service.spec.template.metadata as any).name;
    service.spec.template.spec.containerConcurrency = concurrency;

    try {
      await cloudrun.replaceService(name, service);
      return;
    } catch (err) {
      // We might get a 409 if resourceVersion does not match
      if (err.status !== 409) {
        throw new FirebaseError("Unexpected error while trying to set concurrency", {
          original: err,
        });
      }
    }
  }
}

export function functionsDeploymentHandler(
  timer: DeploymentTimer,
  errorHandler: ErrorHandler
): (task: DeploymentTask<backend.FunctionSpec>) => Promise<any | undefined> {
  return async (task: DeploymentTask<backend.FunctionSpec>) => {
    let result;
    const fnName = backend.functionName(task.data);
    try {
      timer.startTimer(fnName, task.operationType);
      result = await task.run();
      helper.printSuccess(task.data, task.operationType);
      const duration = timer.endTimer(fnName);
      track("function_deploy_success", backend.triggerTag(task.data), duration);
    } catch (err) {
      if (err.original?.context?.response?.statusCode === 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      }
      errorHandler.record("error", fnName, task.operationType, err.original?.message || "");
      const duration = timer.endTimer(fnName);
      track("function_deploy_failure", backend.triggerTag(task.data), duration);
    }
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
  queue: Queue<DeploymentTask<backend.FunctionSpec>, void>
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
    let task: DeploymentTask<backend.FunctionSpec>;
    // GCF v2 doesn't support tokens yet. If we were to pass onPoll to a GCFv2 function, then
    // it would complete deployment and resolve the getRealToken promies as undefined.
    if (functionSpec.platform == "gcfv2") {
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
  deploys.push(
    ...regionalDeployment.functionsToUpdate.map(async (update) => {
      if (update.deleteAndRecreate) {
        await queue.run(deleteFunctionTask(params, update.func));
        return deploy(update.func, createFunctionTask);
      } else {
        return deploy(update.func, updateFunctionTask);
      }
    })
  );

  await Promise.all(deploys);

  const deletes = regionalDeployment.functionsToDelete.map(async (fn) => {
    const task = deleteFunctionTask(params, fn);
    await queue.run(task);
  });
  await Promise.all(deletes);
}

/**
 * Cloud Scheduler Deployments Tasks and Handler
 */

export function upsertScheduleTask(
  params: TaskParams,
  schedule: backend.ScheduleSpec,
  appEngineLocation: string
): DeploymentTask<backend.ScheduleSpec> {
  const run = async () => {
    const job = cloudscheduler.jobFromSpec(schedule, appEngineLocation);
    await cloudscheduler.createOrReplaceJob(job);
  };
  return {
    run,
    data: schedule,
    operationType: "upsert schedule",
  };
}

export function deleteScheduleTask(
  params: TaskParams,
  schedule: backend.ScheduleSpec,
  appEngineLocation: string
): DeploymentTask<backend.ScheduleSpec> {
  const run = async () => {
    const jobName = backend.scheduleName(schedule, appEngineLocation);
    await cloudscheduler.deleteJob(jobName);
  };
  return {
    run,
    data: schedule,
    operationType: "delete schedule",
  };
}

export function deleteTopicTask(
  params: TaskParams,
  topic: backend.PubSubSpec
): DeploymentTask<backend.PubSubSpec> {
  const run = async () => {
    const topicName = backend.topicName(topic);
    await pubsub.deleteTopic(topicName);
  };
  return {
    run,
    data: topic,
    operationType: "delete topic",
  };
}

export const schedulerDeploymentHandler = (errorHandler: ErrorHandler) => async (
  task: DeploymentTask<backend.ScheduleSpec | backend.PubSubSpec>
): Promise<void> => {
  try {
    const result = await task.run();
    helper.printSuccess(task.data.targetService, task.operationType);
    return result;
  } catch (err) {
    if (err.status === 429) {
      // Throw quota errors so that throttler retries them.
      throw err;
    } else if (err.status !== 404) {
      // Ignore 404 errors from scheduler calls since they may be deleted out of band.
      errorHandler.record(
        "error",
        backend.functionName(task.data.targetService),
        task.operationType,
        err.message || ""
      );
    }
  }
};
