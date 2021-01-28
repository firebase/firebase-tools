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

const defaultPollerOptions = {
  apiOrigin: functionsOrigin,
  apiVersion: cloudfunctions.API_VERSION,
  masterTimeout: 150000,
};

export interface RetryFunctionParams {
  projectId: string;
  region: string;
  runtime: string;
  sourceUrl: string;
  sourceToken?: string;
}

// TODO: add timers back to this.
export function retryFunctionForCreate(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: any) => any
) {
  return async () => {
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";
    utils.logBullet(
      clc.bold.cyan("functions: ") +
      "creating " +
      getHumanFriendlyRuntimeName(params.runtime) +
      " function " +
      clc.bold(helper.getFunctionLabel(fn.name)) +
      "..."
    );
    const createRes = await cloudfunctions.createFunction({
      projectId: params.projectId,
      region: params.region,
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
          region: params.region,
          policy: cloudfunctions.DEFAULT_PUBLIC_POLICY,
        });
      } catch (err) {
        logger.debug(err);
        // TODO: Better warning language when we can't set IAM policy.
        utils.logWarning(
          `Unable to set publicly accessible IAM policy for HTTPS function "${fn.name}". Unauthorized users will not be able to call this function. `
        );
      }
    }
    return operationResult;
  };
}

export function retryFunctionForUpdate(
  params: RetryFunctionParams,
  fn: CloudFunctionTrigger,
  onPoll?: (op: any) => any
) {
  return async () => {
    const eventType = fn.eventTrigger ? fn.eventTrigger.eventType : "https";

    utils.logBullet(
      clc.bold.cyan("functions: ") +
      "updating " +
      getHumanFriendlyRuntimeName(params.runtime) +
      " function " +
      clc.bold(helper.getFunctionLabel(fn.name)) +
      "..."
    );
    const updateRes = await cloudfunctions.updateFunction({
      projectId: params.projectId,
      region: params.region,
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
    return pollOperation(pollerOptions);
  };
}

export function retryFunctionForDelete(fnName: string) {
  return async () => {
    return cloudfunctions.deleteFunction({
      functionName: fnName,
    });
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
    queue
      .run(retryFunctionForCreate(params, fn))
      .then(() => {
        console.log(`Successfully created ${fn.name}`);
      })
      .catch((err) => {
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
