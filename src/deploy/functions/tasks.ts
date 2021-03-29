import * as clc from "cli-color";

import { logger } from "../../logger";
import * as utils from "../../utils";
import { CloudFunctionTrigger } from "./deploymentPlanner";
import { cloudfunctions, cloudscheduler } from "../../gcp";
import * as deploymentTool from "../../deploymentTool";
import * as helper from "../../functionsDeployHelper";
import { RegionalDeployment } from "./deploymentPlanner";
import { OperationResult, OperationPollerOptions, pollOperation } from "../../operation-poller";
import { functionsOrigin } from "../../api";
import Queue from "../../throttler/queue";
import { getHumanFriendlyRuntimeName } from "../../parseRuntimeAndValidateSDK";
import { deleteTopic } from "../../gcp/pubsub";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";

// TODO: Tune this for better performance.
const defaultPollerOptions = {
  apiOrigin: functionsOrigin,
  apiVersion: cloudfunctions.API_VERSION,
  masterTimeout: 25 * 60000, // 25 minutes is the maximum build time for a function
};

export type OperationType = "create"
  | "update"
  | "delete"
  | "upsert schedule"
  | "delete schedule"
  | "make public";


export interface DeploymentTask {
  (): Promise<any>,
  functionName: string,
  operationType: OperationType,
}

export interface TaskParams {
  projectId: string;
  runtime?: string;
  sourceUrl?: string;
  sourceToken?: string;
  errorHandler: ErrorHandler;
}

/**
 * Cloud Functions Deployments Tasks and Handler
 */


export function createFunctionTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: OperationResult<CloudFunctionTrigger>) => void
): DeploymentTask {
  const task: DeploymentTask = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "creating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
<<<<<<< HEAD
    const createRes = await cloudfunctions.createFunction({
      projectId: params.projectId,
      region: helper.getRegion(fn.name),
      eventType: eventType,
      functionName: helper.getFunctionId(fn.name),
      entryPoint: fn.entryPoint,
      trigger: helper.getFunctionTrigger(fn),
      labels: Object.assign({}, deploymentTool.labels(), fn.labels),
      sourceUploadUrl: params.sourceUrl,
      sourceToken: params.sourceToken,
      runtime: params.runtime,
      availableMemoryMb: fn.availableMemoryMb,
      timeout: fn.timeout,
      maxInstances: fn.maxInstances,
      environmentVariables: fn.environmentVariables,
      vpcConnector: fn.vpcConnector,
      vpcConnectorEgressSettings: fn.vpcConnectorEgressSettings,
      serviceAccountEmail: fn.serviceAccountEmail,
      ingressSettings: fn.ingressSettings,
    });
    const pollerOptions: OperationPollerOptions = Object.assign(
      {
        pollerName: `create-${fn.name}`,
        operationResourceName: createRes.name,
        onPoll,
      },
      defaultPollerOptions
    );
    const operationResult = await pollOperation<CloudFunctionTrigger>(pollerOptions);
    if (eventType === "https") {
      try {
        await cloudfunctions.setIamPolicy({
          name: fn.name,
          policy: cloudfunctions.DEFAULT_PUBLIC_POLICY,
        });
      } catch (err) {
        params.errorHandler.record("warning", fn.name, "make public", err.original.message);
=======
    try {
      const createRes = await cloudfunctions.createFunction({
        projectId: params.projectId,
        region: helper.getRegion(fn.name),
        eventType: eventType,
        functionName: helper.getFunctionId(fn.name),
        entryPoint: fn.entryPoint,
        trigger: helper.getFunctionTrigger(fn),
        labels: Object.assign({}, deploymentTool.labels(), fn.labels),
        sourceUploadUrl: params.sourceUrl,
        sourceToken: params.sourceToken,
        runtime: params.runtime,
        availableMemoryMb: fn.availableMemoryMb,
        timeout: fn.timeout,
        maxInstances: fn.maxInstances,
        environmentVariables: fn.environmentVariables,
        vpcConnector: fn.vpcConnector,
        vpcConnectorEgressSettings: fn.vpcConnectorEgressSettings,
        serviceAccountEmail: fn.serviceAccountEmail,
        ingressSettings: fn.ingressSettings,
      });
      const pollerOptions: OperationPollerOptions = Object.assign(
        {
          pollerName: `create-${fn.name}`,
          operationResourceName: createRes.name,
          onPoll,
        },
        defaultPollerOptions
      );
      const operationResult = await pollOperation<CloudFunctionTrigger>(pollerOptions);
      if (eventType === "https") {
        try {
          await cloudfunctions.setIamPolicy({
            name: fn.name,
            policy: cloudfunctions.DEFAULT_PUBLIC_POLICY,
          });
        } catch (err) {
          params.errorHandler.record("warning", fn.name, "make public", err.message);
        }
>>>>>>> public/master
      }
    }
    return operationResult;
  };
  task.functionName = fn.name;
  task.operationType = "create";
  return task;
}

export function updateFunctionTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: OperationResult<CloudFunctionTrigger>) => void
): DeploymentTask {
  const task: DeploymentTask = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "updating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
    const updateRes = await cloudfunctions.updateFunction({
      projectId: params.projectId,
      region: helper.getRegion(fn.name),
      eventType: eventType,
      functionName: helper.getFunctionId(fn.name),
      entryPoint: fn.entryPoint,
      trigger: helper.getFunctionTrigger(fn),
      labels: Object.assign({}, deploymentTool.labels(), fn.labels),
      sourceUploadUrl: params.sourceUrl,
      sourceToken: params.sourceToken,
      runtime: params.runtime,
      availableMemoryMb: fn.availableMemoryMb,
      timeout: fn.timeout,
      maxInstances: fn.maxInstances,
      environmentVariables: fn.environmentVariables,
      vpcConnector: fn.vpcConnector,
      vpcConnectorEgressSettings: fn.vpcConnectorEgressSettings,
      serviceAccountEmail: fn.serviceAccountEmail,
      ingressSettings: fn.ingressSettings,
    });
    const pollerOptions: OperationPollerOptions = Object.assign(
      {
        pollerName: `update-${fn.name}`,
        operationResourceName: updateRes.name,
        onPoll,
      },
      defaultPollerOptions
    );
    const operationResult = await pollOperation<CloudFunctionTrigger>(pollerOptions);
    return operationResult;
  };
  task.functionName = fn.name;
  task.operationType = "update";
  return task;
}

export function deleteFunctionTask(params: TaskParams, fnName: string): DeploymentTask {
  const task: DeploymentTask = async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "deleting function " +
        clc.bold(helper.getFunctionLabel(fnName)) +
        "..."
    );
    const deleteRes = await cloudfunctions.deleteFunction({
      functionName: fnName,
    });
    const pollerOptions: OperationPollerOptions = Object.assign(
      {
        pollerName: `delete-${fnName}`,
        operationResourceName: deleteRes.name,
      },
      defaultPollerOptions
    );
    return await pollOperation<void>(pollerOptions);
  };
  task.functionName = fnName;
  task.operationType = "delete";
  return task;
}

export function functionsDeploymentHandler(timer: DeploymentTimer, errorHandler: ErrorHandler): (task: DeploymentTask) => Promise<any | undefined> {
  return async (task: DeploymentTask) => {
    let result;
    try {
      timer.startTimer(task.functionName, task.operationType);
      result = await task();
      helper.printSuccess(task.functionName, task.operationType);
    } catch (err) {
      if (err.original?.context?.response?.statusCode === 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      }
      errorHandler.record("error", task.functionName, task.operationType, err.original.message || "");
    }
    timer.endTimer(task.functionName);
    return result;
  }
}

/**
 * Adds tasks to execute all function creates and updates for a region to the provided queue.
 */
export function runRegionalFunctionDeployment(
  params: TaskParams,
  regionalDeployment: RegionalDeployment,
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
      logger.debug(
        `Got sourceToken ${op.metadata.sourceToken} for region ${regionalDeployment.region}`
      );
      regionalDeployment.sourceToken = op.metadata.sourceToken;
      finishRegionalFunctionDeployment(params, regionalDeployment, queue);
    }
  };
  // Choose a first function to deploy.
  if (regionalDeployment.functionsToCreate.length) {
    const firstFn = regionalDeployment.functionsToCreate.shift()!;
    const task = createFunctionTask(params, firstFn!, onPollFn);
    return queue.run(task);
  } else if (regionalDeployment.functionsToUpdate.length) {
    const firstFn = regionalDeployment.functionsToUpdate.shift()!;
    const task = updateFunctionTask(params, firstFn!, onPollFn);
    return queue.run(task);
  }
  // If there are no functions to create or update in this region, no need to do anything.
  return Promise.resolve();
}

function finishRegionalFunctionDeployment(
  params: TaskParams,
  regionalDeployment: RegionalDeployment,
  queue: Queue<DeploymentTask, void>
): void {
  params.sourceToken = regionalDeployment.sourceToken;
  for (const fn of regionalDeployment.functionsToCreate) {
    queue.run(createFunctionTask(params, fn));
  }
  for (const fn of regionalDeployment.functionsToUpdate) {
    queue.run(updateFunctionTask(params, fn));
  }
}

/**
 * Cloud Scheduler Deployments Tasks and Handler
 */

export function upsertScheduleTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  appEngineLocation: string
): DeploymentTask {
  const task: DeploymentTask = async () => {
    const job = helper.toJob(fn, appEngineLocation, params.projectId);
    return await cloudscheduler.createOrReplaceJob(job);
  };
  task.functionName = fn.name;
  task.operationType = "upsert schedule";
  return task;
}

export function deleteScheduleTask(
  params: TaskParams,
  fnName: string,
  appEngineLocation: string
): DeploymentTask {
  const task: DeploymentTask = async () => {
    const jobName = helper.getScheduleName(fnName, appEngineLocation);
    const topicName = helper.getTopicName(fnName);
    await cloudscheduler.deleteJob(jobName);
    await deleteTopic(topicName);
  };
  task.functionName = fnName;
  task.operationType = "delete schedule";
  return task;
}

export function schedulerDeploymentHandler(errorHandler: ErrorHandler): (task: DeploymentTask) => Promise<any | undefined> {
  return async (task: DeploymentTask) => {
    let result;
    try {
      result = await task();
      helper.printSuccess(task.functionName, task.operationType)
    } catch (err) {
      if (err.status === 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      } else if (err.status !== 404) {
        // Ignore 404 errors from scheduler calls since they may be deleted out of band.
        errorHandler.record("error", task.functionName, task.operationType, err.original.message || "");
      }
    }
  }
}
