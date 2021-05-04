import * as clc from "cli-color";

import Queue from "../../throttler/queue";
import { logger } from "../../logger";
import { RegionalFunctionChanges } from "./deploymentPlanner";
import { OperationResult, OperationPollerOptions, pollOperation } from "../../operation-poller";
import { functionsOrigin } from "../../api";
import { getHumanFriendlyRuntimeName } from "./parseRuntimeAndValidateSDK";
import { deleteTopic } from "../../gcp/pubsub";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";
import { FirebaseError } from "../../error";
import * as backend from "./backend";
import * as cloudscheduler from "../../gcp/cloudscheduler";
import * as gcf from "../../gcp/cloudfunctions";
import * as helper from "./functionsDeployHelper";
import * as utils from "../../utils";

// TODO: Tune this for better performance.
const defaultPollerOptions = {
  apiOrigin: functionsOrigin,
  apiVersion: gcf.API_VERSION,
  masterTimeout: 25 * 60000, // 25 minutes is the maximum build time for a function
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
  run: () => Promise<any>;
  fn: backend.TargetIds;
  operationType: OperationType;
}

export interface TaskParams {
  projectId: string;
  runtime?: backend.Runtime;
  sourceUrl?: string;
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
    if (fn.apiVersion != 1) {
      throw new FirebaseError("Only v1 of the GCF API is currently supported");
    }
    const apiFunction = backend.toGCFv1Function(fn, params.sourceUrl!);
    if (sourceToken) {
      apiFunction.sourceToken = sourceToken;
    }
    const createRes = await gcf.createFunction(apiFunction);
    const pollerOptions: OperationPollerOptions = {
      ...defaultPollerOptions,
      pollerName: `create-${fnName}`,
      operationResourceName: createRes.name,
      onPoll,
    };
    const operationResult = await pollOperation<gcf.CloudFunction>(pollerOptions);
    if (!backend.isEventTrigger(fn.trigger)) {
      try {
        await gcf.setIamPolicy({
          name: fnName,
          policy: gcf.DEFAULT_PUBLIC_POLICY,
        });
      } catch (err) {
        params.errorHandler.record("warning", fnName, "make public", err.message);
      }
    }
    return operationResult;
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
    if (fn.apiVersion !== 1) {
      throw new FirebaseError("Only v1 of the GCF API is currently supported");
    }
    // TODO(inlined): separate check for updating a v1 function to a v2 function.
    // Should this be part of deployment plan instead?
    const apiFunction = backend.toGCFv1Function(fn, params.sourceUrl!);
    if (sourceToken) {
      apiFunction.sourceToken = sourceToken;
    }
    const updateRes = await gcf.updateFunction(apiFunction);
    const pollerOptions: OperationPollerOptions = {
      ...defaultPollerOptions,
      pollerName: `update-${fnName}`,
      operationResourceName: updateRes.name,
      onPoll,
    };
    const operationResult = await pollOperation<gcf.CloudFunction>(pollerOptions);
    return operationResult;
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
    if (fn.apiVersion !== 1) {
      throw new FirebaseError("Only v1 of the GCF API is currently supported");
    }
    const deleteRes = await gcf.deleteFunction(backend.functionName(fn));
    const pollerOptions: OperationPollerOptions = Object.assign(
      {
        pollerName: `delete-${fnName}`,
        operationResourceName: deleteRes.name,
      },
      defaultPollerOptions
    );
    return await pollOperation<void>(pollerOptions);
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
export function runRegionalFunctionDeployment(
  params: TaskParams,
  region: string,
  regionalDeployment: RegionalFunctionChanges,
  queue: Queue<DeploymentTask, void>
): Promise<void> {
  // Build an onPoll function to check for sourceToken and queue up the rest of the deployment.
  const onPollFn = (op: any) => {
    // We should run the rest of the regional deployment if we either:
    // - Have a sourceToken to use.
    // - Never got a sourceToken back from the operation. In this case, finish the deployment without using sourceToken.
    const shouldFinishDeployment =
      (op.metadata?.sourceToken && !regionalDeployment.sourceToken) ||
      (!op.metadata?.sourceToken && op.done);
    if (shouldFinishDeployment) {
      logger.debug(`Got sourceToken ${op.metadata.sourceToken} for region ${region}`);
      regionalDeployment.sourceToken = op.metadata.sourceToken;
      finishRegionalFunctionDeployment(params, regionalDeployment, queue);
    }
  };
  // Choose a first function to deploy.
  if (regionalDeployment.functionsToCreate.length) {
    const firstFn = regionalDeployment.functionsToCreate.shift()!;
    const task = createFunctionTask(params, firstFn!, /* sourceToken= */ undefined, onPollFn);
    return queue.run(task);
  } else if (regionalDeployment.functionsToUpdate.length) {
    const firstFn = regionalDeployment.functionsToUpdate.shift()!;
    const task = updateFunctionTask(params, firstFn!, /* sourceToken= */ undefined, onPollFn);
    return queue.run(task);
  }
  // If there are no functions to create or update in this region, no need to do anything.
  return Promise.resolve();
}

function finishRegionalFunctionDeployment(
  params: TaskParams,
  regionalChanges: RegionalFunctionChanges,
  queue: Queue<DeploymentTask, void>
): void {
  for (const fn of regionalChanges.functionsToCreate) {
    void queue.run(createFunctionTask(params, fn, regionalChanges.sourceToken));
  }
  for (const fn of regionalChanges.functionsToUpdate) {
    void queue.run(updateFunctionTask(params, fn, regionalChanges.sourceToken));
  }
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

export function schedulerDeploymentHandler(
  errorHandler: ErrorHandler
): (task: DeploymentTask) => Promise<any | undefined> {
  return async (task: DeploymentTask) => {
    let result;
    try {
      result = await task.run();
      helper.printSuccess(task.fn, task.operationType);
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
    return result;
  };
}
