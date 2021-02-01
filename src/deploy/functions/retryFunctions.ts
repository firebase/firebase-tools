import * as _ from "lodash";
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
}

export function retryFunctionForCreate(
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
      labels: _.assign({}, deploymentTool.labels(), fn.labels),
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
    const pollerOptions: OperationPollerOptions = _.assign(
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
        logger.debug(err);
        // TODO: Better warning language when we can't set IAM policy to make functions public?
        utils.logWarning(
          `Unable to set publicly accessible IAM policy for HTTPS function "${fn.name}". Unauthorized users will not be able to call this function. `
        );
      }
    }
    params.timer.endTimer(fn.name);
    return operationResult;
  };
}

export function retryFunctionForUpdate(
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
      labels: _.assign({}, deploymentTool.labels(), fn.labels),
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
    const pollerOptions: OperationPollerOptions = _.assign(
      {
        pollerName: `update-${fn.name}`,
        operationResourceName: updateRes.name,
        onPoll,
      },
      defaultPollerOptions
    );
    const pollRes = await pollOperation(pollerOptions);
    params.timer.endTimer(fn.name);
  };
}

export function retryFunctionForDelete(params: RetryFunctionParams, fnName: string) {
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
    const pollerOptions: OperationPollerOptions = _.assign(
      {
        pollerName: `delete-${fnName}`,
        operationResourceName: deleteRes.name,
      },
      defaultPollerOptions
    );
    const pollRes = await pollOperation(pollerOptions);
    params.timer.endTimer(fnName);
  };
}

export function retryFunctionForScheduleCreateOrUpdate(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  appEngineLocation: string
) {
  return async () => {
    const job = helper.toJob(fn, appEngineLocation, params.projectId);
    return cloudscheduler.createOrReplaceJob(job);
  };
}

export function retryFunctionForScheduleDelete(fnName: string, appEngineLocation: string) {
  return async () => {
    const jobName = helper.getScheduleName(fnName, appEngineLocation);
    const topicName = helper.getTopicName(fnName);
    await cloudscheduler.deleteJob(jobName);
    return deleteTopic(topicName);
  };
}

export function runRegionalDeployment(
  params: RetryFunctionParams,
  regionalDeployment: RegionalDeployment,
  queue: Queue<any, any>
) {
  for (const fn of regionalDeployment.functionsToCreate) {
    queue.run(retryFunctionForCreate(params, fn)).catch((err) => {
      logger.debug();
      console.log(`Error while creating ${fn.name}: ${err}`);
    });
  }
  for (const fn of regionalDeployment.functionsToUpdate) {
    queue
      .run(retryFunctionForUpdate(params, fn))
      .then(() => {
        console.log(`Successfully updated ${fn.name}`);
      })
      .catch((err) => {
        console.log(`Error while updating ${fn.name}: ${err}`);
      });
  }
}
