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

export interface TaskParams {
  projectId: string;
  runtime?: string;
  sourceUrl?: string;
  sourceToken?: string;
  timer: DeploymentTimer;
  errorHandler: ErrorHandler;
}

export function createFunctionTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: OperationResult<CloudFunctionTrigger>) => void
): () => Promise<CloudFunctionTrigger | void> {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "creating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    params.timer.startTimer(fn.name, "create");
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
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
      }
      params.timer.endTimer(fn.name);
      helper.printSuccess(fn.name, "create");
      return operationResult;
    } catch (err) {
      params.errorHandler.record("error", fn.name, "create", err.message || "");
    }
  };
}

export function updateFunctionTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: OperationResult<CloudFunctionTrigger>) => void
): () => Promise<CloudFunctionTrigger | void> {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "updating " +
        getHumanFriendlyRuntimeName(params.runtime!) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    params.timer.startTimer(fn.name, "update");
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
    try {
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
      params.timer.endTimer(fn.name);
      helper.printSuccess(fn.name, "update");
      return operationResult;
    } catch (err) {
      params.errorHandler.record("error", fn.name, "update", err.message || "");
    }
  };
}

export function deleteFunctionTask(params: TaskParams, fnName: string) {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "deleting function " +
        clc.bold(helper.getFunctionLabel(fnName)) +
        "..."
    );
    params.timer.startTimer(fnName, "delete");
    try {
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
      const operationResult = await pollOperation<void>(pollerOptions);
      params.timer.endTimer(fnName);
      helper.printSuccess(fnName, "delete");
      return operationResult;
    } catch (err) {
      params.errorHandler.record("error", fnName, "delete", err.message || "");
    }
  };
}

export function upsertScheduleTask(
  params: TaskParams,
  fn: CloudFunctionTrigger,
  appEngineLocation: string
): () => Promise<any> {
  return async () => {
    const job = helper.toJob(fn, appEngineLocation, params.projectId);
    try {
      await cloudscheduler.createOrReplaceJob(job);
      helper.printSuccess(fn.name, "upsert schedule");
    } catch (err) {
      params.errorHandler.record("error", fn.name, "upsert schedule", err.message || "");
    }
  };
}

export function deleteScheduleTask(
  params: TaskParams,
  fnName: string,
  appEngineLocation: string
): () => Promise<void> {
  return async () => {
    const jobName = helper.getScheduleName(fnName, appEngineLocation);
    const topicName = helper.getTopicName(fnName);
    try {
      await cloudscheduler.deleteJob(jobName);
    } catch (err) {
      // If the job has already been deleted, don't throw an error.
      if (err.status !== 404) {
        params.errorHandler.record("error", fnName, "delete schedule", err.message || "");
        return;
      }
      logger.debug(`Scheduler job ${jobName} not found.`);
    }
    try {
      await deleteTopic(topicName);
      helper.printSuccess(fnName, "delete schedule");
    } catch (err) {
      // If the topic has already been deleted, don't throw an error.
      if (err.status !== 404) {
        params.errorHandler.record("error", fnName, "delete schedule", err.message || "");
        return;
      }
      logger.debug(`Scheduler topic ${topicName} not found.`);
    }
  };
}

/**
 * Adds tasks to execute all function creates and updates for a region to the provided queue.
 */
export function runRegionalFunctionDeployment(
  params: TaskParams,
  regionalDeployment: RegionalDeployment,
  queue: Queue<() => Promise<any>, void>
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
  queue: Queue<() => Promise<any>, void>
): void {
  params.sourceToken = regionalDeployment.sourceToken;
  for (const fn of regionalDeployment.functionsToCreate) {
    queue.run(createFunctionTask(params, fn));
  }
  for (const fn of regionalDeployment.functionsToUpdate) {
    queue.run(updateFunctionTask(params, fn));
  }
}
