import * as clc from "cli-color";

import * as logger from "../../logger";
import * as utils from "../../utils";
import { CloudFunctionTrigger } from "./deploymentPlanner";
import { cloudfunctions, cloudscheduler } from "../../gcp";
import * as deploymentTool from "../../deploymentTool";
import * as helper from "../../functionsDeployHelper";
import { RegionalDeployment } from "./deploymentPlanner";
import { OperationPollerOptions, pollOperation } from "../../operation-poller";
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
  masterTimeout: 150000,
};

export interface RetryFunctionParams {
  projectId: string;
  runtime: string;
  sourceUrl: string;
  sourceToken?: string;
  timer: DeploymentTimer;
  errorHandler: ErrorHandler;
}

export function createFunctionTask(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: any) => any
) {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "creating " +
        getHumanFriendlyRuntimeName(params.runtime) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    params.timer.startTimer(fn.name, "create");
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
    const createRes = await cloudfunctions.createFunction({
      projectId: params.projectId,
      region: helper.getRegion(fn.name),
      eventType: eventType,
      functionName: helper.getFunctionName(fn.name),
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
    const operationResult = await pollOperation(pollerOptions);
    if (eventType === "https") {
      try {
        await cloudfunctions.setIamPolicy({
          functionName: fn.name,
          projectId: params.projectId,
          region: helper.getRegion(fn.name),
          policy: cloudfunctions.DEFAULT_PUBLIC_POLICY,
        });
      } catch (err) {
        params.errorHandler.record("warning", fn.name, "make public", err.message);
      }
    }
    params.timer.endTimer(fn.name);
    return operationResult;
  };
}

export function updateFunctionTask(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: any) => any
) {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "updating " +
        getHumanFriendlyRuntimeName(params.runtime) +
        " function " +
        clc.bold(helper.getFunctionLabel(fn.name)) +
        "..."
    );
    params.timer.startTimer(fn.name, "update");
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
    const updateRes = await cloudfunctions.updateFunction({
      projectId: params.projectId,
      region: helper.getRegion(fn.name),
      eventType: eventType,
      functionName: helper.getFunctionName(fn.name),
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
    const operationResult = await pollOperation(pollerOptions);
    params.timer.endTimer(fn.name);
    return operationResult;
  };
}

export function deleteFunctionTask(params: RetryFunctionParams, fnName: string) {
  return async () => {
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        "deleting function " +
        clc.bold(helper.getFunctionLabel(fnName)) +
        "..."
    );
    params.timer.startTimer(fnName, "delete");
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
    const operationResult = await pollOperation(pollerOptions);
    params.timer.endTimer(fnName);
    return operationResult;
  };
}

export function upsertScheduleTask(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  appEngineLocation: string
) {
  return async () => {
    const job = helper.toJob(fn, appEngineLocation, params.projectId);
    return cloudscheduler.createOrReplaceJob(job);
  };
}

export function deleteScheduleTask(fnName: string, appEngineLocation: string) {
  return async () => {
    const jobName = helper.getScheduleName(fnName, appEngineLocation);
    const topicName = helper.getTopicName(fnName);
    await cloudscheduler.deleteJob(jobName);
    return deleteTopic(topicName);
  };
}

/**
 *
 * @param params
 * @param regionalDeployment
 * @param queue
 */
export function runRegionalFunctionDeployment(
  params: RetryFunctionParams,
  regionalDeployment: RegionalDeployment,
  queue: Queue<any, any>
): Promise<any> {
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
    return queue
      .run(task)
      .then(() => {
        helper.printSuccess(firstFn.name, "create");
      })
      .catch((err) => {
        params.errorHandler.record("error", firstFn.name, "create", err.message || "");
      });
  } else if (regionalDeployment.functionsToUpdate.length) {
    const firstFn = regionalDeployment.functionsToUpdate.shift()!;
    const task = updateFunctionTask(params, firstFn!, onPollFn);
    return queue
      .run(task)
      .then(() => {
        helper.printSuccess(firstFn.name, "update");
      })
      .catch((err) => {
        params.errorHandler.record("error", firstFn.name, "update", err.message || "");
      });
  }
  // If there are no functions to create or update in this region, no need to do anything.
  return Promise.resolve();
}

function finishRegionalFunctionDeployment(
  params: RetryFunctionParams,
  regionalDeployment: RegionalDeployment,
  queue: Queue<any, any>
) {
  for (const fn of regionalDeployment.functionsToCreate) {
    queue
      .run(createFunctionTask(params, fn))
      .then(() => {
        helper.printSuccess(fn.name, "create");
      })
      .catch((err) => {
        params.errorHandler.record("error", fn.name, "create", err.message || "");
      });
  }
  for (const fn of regionalDeployment.functionsToUpdate) {
    queue
      .run(updateFunctionTask(params, fn))
      .then(() => {
        helper.printSuccess(fn.name, "update");
      })
      .catch((err) => {
        params.errorHandler.record("error", fn.name, "update", err.message || "");
      });
  }
}
