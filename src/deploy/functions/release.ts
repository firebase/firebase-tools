/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import * as clc from "cli-color";
import * as _ from "lodash";

import { cloudfunctions, cloudscheduler, pubsub } from "../../gcp";
import * as logger from "../../logger";
import * as deploymentTool from "../../deploymentTool";
import * as track from "../../track";
import * as utils from "../../utils";
import * as helper from "../../functionsDeployHelper";
import { FirebaseError } from "../../error";
import { getHumanFriendlyRuntimeName } from "../../parseRuntimeAndValidateSDK";
import { getAppEngineLocation } from "../../functionsConfig";
import { promptOnce } from "../../prompt";
import { createOrUpdateSchedulesAndTopics } from "./createOrUpdateSchedulesAndTopics";

interface Timing {
  type?: string;
  t0?: [number, number]; // [seconds, nanos]
}

interface Deployment {
  name: string;
  retryFunction: () => any;
  trigger?: any; // TODO: type this
}

let timings: { [name: string]: Timing } = {};
let deployments: Deployment[] = [];
let failedDeployments: string[] = [];

const DEFAULT_PUBLIC_POLICY = {
  version: 3,
  bindings: [
    {
      role: "roles/cloudfunctions.invoker",
      members: ["allUsers"],
    },
  ],
};

function startTimer(name: string, type: string): void {
  timings[name] = { type: type, t0: process.hrtime() };
}

function endTimer(name: string): void {
  if (!timings[name]) {
    logger.debug("[functions] no timer initialized for", name);
    return;
  }

  // hrtime returns a duration as an array of [seconds, nanos]
  const duration = process.hrtime(timings[name].t0);
  track(
    "Functions Deploy (Duration)",
    timings[name].type,
    duration[0] * 1000 + Math.round(duration[1] * 1e-6)
  );
}

async function setTriggerUrls(
  projectId: string,
  ops: helper.Operation[],
  sourceUrl: string
): Promise<void> {
  if (!_.find(ops, ["trigger.httpsTrigger", {}])) {
    // No HTTPS functions being deployed
    return;
  }

  const functions = await cloudfunctions.listAllFunctions(projectId);
  const httpFunctions = _.chain(functions)
    .filter({ sourceUploadUrl: sourceUrl })
    .filter("httpsTrigger")
    .value();
  _.forEach(httpFunctions, (httpFunc) => {
    const op = _.find(ops, { funcName: httpFunc.name });
    if (op) {
      op.triggerUrl = httpFunc.httpsTrigger.url;
    }
  });
  return;
}

function printSuccess(op: helper.Operation): void {
  endTimer(op.funcName);
  utils.logSuccess(
    clc.bold.green("functions[" + helper.getFunctionLabel(op.funcName) + "]: ") +
      "Successful " +
      op.type +
      " operation. "
  );
  if (op.triggerUrl && op.type !== "delete") {
    logger.info(
      clc.bold("Function URL"),
      "(" + helper.getFunctionName(op.funcName) + "):",
      op.triggerUrl
    );
  }
}

function printFail(op: helper.Operation): void {
  endTimer(op.funcName);
  failedDeployments.push(helper.getFunctionName(op.funcName));
  utils.logWarning(
    clc.bold.yellow("functions[" + helper.getFunctionLabel(op.funcName) + "]: ") +
      "Deployment error."
  );
  if (op.error?.code === 8) {
    logger.debug(op.error.message);
    logger.info(
      "You have exceeded your deployment quota, please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. Go to " +
        clc.underline("https://firebase.google.com/docs/cli/#deploy_specific_functions") +
        " to learn more."
    );
  } else {
    logger.info(op.error?.message);
  }
}

function printTooManyOps(projectId: string): void {
  utils.logWarning(
    clc.bold.yellow("functions:") + " too many functions are being deployed, cannot poll status."
  );
  logger.info(
    "In a few minutes, you can check status at " + utils.consoleUrl(projectId, "/functions/logs")
  );
  logger.info(
    "You can use the --only flag to deploy only a portion of your functions in the future."
  );
  deployments = []; // prevents analytics tracking of deployments
}

function pluckName(func: helper.CloudFunction): string {
  return _.get(func, "name"); // e.g.'projects/proj1/locations/us-central1/functions/func'
}

function isScheduled(func: helper.CloudFunction): boolean {
  return _.get(func, "labels.deployment-scheduled") === "true";
}

export async function release(context: any, options: any, payload: any): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const projectId = context.projectId;
  const sourceUrl = context.uploadUrl;

  // Reset module-level variables to prevent duplicate deploys when using firebase-tools as an import.
  timings = {};
  deployments = [];
  failedDeployments = [];

  const appEngineLocation = getAppEngineLocation(context.firebaseConfig);
  let functionsInfo = helper.getFunctionsInfo(payload.functions.triggers, projectId);
  functionsInfo = functionsInfo.map((fn) => {
    if (
      fn.eventTrigger &&
      fn.schedule &&
      fn.eventTrigger.eventType === "google.pubsub.topic.publish"
    ) {
      const [, , , region, , funcName] = fn.name.split("/");
      const newResource = `${fn.eventTrigger.resource}/firebase-schedule-${funcName}-${region}`;
      fn.eventTrigger.resource = newResource;
    }
    return fn;
  });
  const uploadedNames = _.map(functionsInfo, "name");
  const runtime = context.runtimeChoice;
  const functionFilterGroups = helper.getFilterGroups(options);

  // Collect all the functions that have a retry policy
  const failurePolicyFunctions = functionsInfo.filter((fn) => {
    return !!fn.failurePolicy;
  });

  if (failurePolicyFunctions.length) {
    const failurePolicyFunctionLabels = failurePolicyFunctions.map((fn) => {
      return helper.getFunctionLabel(_.get(fn, "name"));
    });
    const retryMessage =
      "The following functions will be retried in case of failure: " +
      clc.bold(failurePolicyFunctionLabels.join(", ")) +
      ". " +
      "Retried executions are billed as any other execution, and functions are retried repeatedly until they either successfully execute or the maximum retry period has elapsed, which can be up to 7 days. " +
      "For safety, you might want to ensure that your functions are idempotent; see https://firebase.google.com/docs/functions/retries to learn more.";

    utils.logLabeledWarning("functions", retryMessage);

    if (options.nonInteractive && !options.force) {
      throw new FirebaseError("Pass the --force option to deploy functions with a failure policy", {
        exit: 1,
      });
    } else if (!options.nonInteractive) {
      const proceed = await promptOnce({
        type: "confirm",
        name: "confirm",
        default: false,
        message: "Would you like to proceed with deployment?",
      });
      if (!proceed) {
        throw new FirebaseError("Deployment canceled.", { exit: 1 });
      }
    }
  }

  delete payload.functions;

  const existingFunctions: helper.CloudFunction[] = context.existingFunctions;
  const existingNames = _.map(existingFunctions, pluckName);
  const existingScheduledFunctions = _.chain(existingFunctions)
    .filter(isScheduled)
    .map(pluckName)
    .value();
  const releaseNames = helper.getReleaseNames(uploadedNames, existingNames, functionFilterGroups);
  // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
  const deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;
  helper.logFilters(existingNames, releaseNames, functionFilterGroups);

  const defaultEnvVariables = {
    FIREBASE_CONFIG: JSON.stringify(context.firebaseConfig),
  };

  // Create functions
  _.chain(uploadedNames)
    .difference(existingNames)
    .intersection(releaseNames)
    .forEach((name) => {
      const functionInfo = _.find(functionsInfo, { name: name })!;
      const functionTrigger = helper.getFunctionTrigger(functionInfo);
      const functionName = helper.getFunctionName(name);
      const region = helper.getRegion(name);
      utils.logBullet(
        clc.bold.cyan("functions: ") +
          "creating " +
          getHumanFriendlyRuntimeName(runtime) +
          " function " +
          clc.bold(helper.getFunctionLabel(name)) +
          "..."
      );
      logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
      const eventType = functionTrigger.eventTrigger
        ? functionTrigger.eventTrigger.eventType
        : "https";
      startTimer(name, "create");
      const retryFunction = async () => {
        const createRes = await cloudfunctions.createFunction({
          projectId: projectId,
          region: region,
          eventType: eventType,
          functionName: functionName,
          entryPoint: functionInfo.entryPoint,
          trigger: functionTrigger,
          labels: _.assign({}, deploymentTool.labels(), functionInfo.labels),
          sourceUploadUrl: sourceUrl,
          runtime: runtime,
          availableMemoryMb: functionInfo.availableMemoryMb,
          timeout: functionInfo.timeout,
          maxInstances: functionInfo.maxInstances,
          environmentVariables: defaultEnvVariables,
          vpcConnector: functionInfo.vpcConnector,
          vpcConnectorEgressSettings: functionInfo.vpcConnectorEgressSettings,
          serviceAccountEmail: functionInfo.serviceAccountEmail,
        });
        if (_.has(functionTrigger, "httpsTrigger")) {
          logger.debug(`Setting public policy for function ${functionName}`);
          await cloudfunctions.setIamPolicy({
            functionName,
            projectId,
            region,
            policy: DEFAULT_PUBLIC_POLICY,
          });
        }
        return createRes;
      };

      deployments.push({
        name,
        retryFunction,
        trigger: functionTrigger,
      });
    })
    .value();

  // Update functions
  _.chain(uploadedNames)
    .intersection(existingNames)
    .intersection(releaseNames)
    .forEach((name) => {
      const functionInfo = _.find(functionsInfo, { name: name })!;
      const functionTrigger = helper.getFunctionTrigger(functionInfo);
      const functionName = helper.getFunctionName(name);
      const region = helper.getRegion(name);
      const existingFunction = _.find(existingFunctions, {
        name: name,
      })!;

      utils.logBullet(
        clc.bold.cyan("functions: ") +
          "updating " +
          getHumanFriendlyRuntimeName(runtime) +
          " function " +
          clc.bold(helper.getFunctionLabel(name)) +
          "..."
      );
      logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
      startTimer(name, "update");
      const options = {
        projectId: projectId,
        region: region,
        functionName: functionName,
        trigger: functionTrigger,
        sourceUploadUrl: sourceUrl,
        labels: _.assign({}, deploymentTool.labels(), functionInfo.labels),
        availableMemoryMb: functionInfo.availableMemoryMb,
        timeout: functionInfo.timeout,
        runtime: runtime,
        maxInstances: functionInfo.maxInstances,
        vpcConnector: functionInfo.vpcConnector,
        vpcConnectorEgressSettings: functionInfo.vpcConnectorEgressSettings,
        serviceAccountEmail: functionInfo.serviceAccountEmail,
        environmentVariables: _.assign(
          {},
          existingFunction.environmentVariables,
          defaultEnvVariables
        ),
      };
      deployments.push({
        name: name,
        retryFunction: async function() {
          return cloudfunctions.updateFunction(options);
        },
        trigger: functionTrigger,
      });
    })
    .value();

  // Delete functions
  const functionsToDelete = _.chain(existingFunctions)
    .filter((functionInfo) => {
      return deploymentTool.check(functionInfo.labels);
    }) // only delete functions uploaded via firebase-tools
    .map(pluckName)
    .difference(uploadedNames)
    .intersection(deleteReleaseNames)
    .value();

  if (functionsToDelete.length) {
    const deleteList = _.map(functionsToDelete, (func) => {
      return "\t" + helper.getFunctionLabel(func);
    }).join("\n");

    if (options.nonInteractive && !options.force) {
      const deleteCommands = _.map(functionsToDelete, (func) => {
        return (
          "\tfirebase functions:delete " +
          helper.getFunctionName(func) +
          " --region " +
          helper.getRegion(func)
        );
      }).join("\n");

      throw new FirebaseError(
        "The following functions are found in your project but do not exist in your local source code:\n" +
          deleteList +
          "\n\nAborting because deletion cannot proceed in non-interactive mode. To fix, manually delete the functions by running:\n" +
          clc.bold(deleteCommands)
      );
    } else if (!options.force) {
      logger.info(
        "\nThe following functions are found in your project but do not exist in your local source code:\n" +
          deleteList +
          "\n\nIf you are renaming a function or changing its region, it is recommended that you create the new " +
          "function first before deleting the old one to prevent event loss. For more info, visit " +
          clc.underline("https://firebase.google.com/docs/functions/manage-functions#modify" + "\n")
      );
    }

    let proceed = true;
    if (!options.force) {
      proceed = await promptOnce({
        type: "confirm",
        name: "confirm",
        default: false,
        message:
          "Would you like to proceed with deletion? Selecting no will continue the rest of the deployments.",
      });
    }
    if (proceed) {
      functionsToDelete.forEach((name) => {
        const functionName = helper.getFunctionName(name);
        const scheduleName = helper.getScheduleName(name, appEngineLocation);
        const topicName = helper.getTopicName(name);
        const region = helper.getRegion(name);

        utils.logBullet(
          clc.bold.cyan("functions: ") +
            "deleting function " +
            clc.bold(helper.getFunctionLabel(name)) +
            "..."
        );
        startTimer(name, "delete");
        let retryFunction;
        const isScheduledFunction = _.includes(existingScheduledFunctions, name);
        if (isScheduledFunction) {
          retryFunction = async function() {
            try {
              await cloudscheduler.deleteJob(scheduleName);
            } catch (err) {
              // if err.status is 404, the schedule doesnt exist, so catch the error
              // if err.status is 403, the project doesnt have the api enabled and there are no schedules to delete, so catch the error
              logger.debug(err);
              if (
                err.context.response.statusCode != 404 &&
                err.context.response.statusCode != 403
              ) {
                throw new FirebaseError(
                  `Failed to delete schedule for ${functionName} with status ${err.status}`,
                  err
                );
              }
            }
            try {
              await pubsub.deleteTopic(topicName);
            } catch (err) {
              // if err.status is 404, the topic doesnt exist, so catch the error
              // if err.status is 403, the project doesnt have the api enabled and there are no topics to delete, so catch the error
              if (
                err.context.response.statusCode != 404 &&
                err.context.response.statusCode != 403
              ) {
                throw new FirebaseError(
                  `Failed to delete topic for ${functionName} with status ${err.status}`,
                  err
                );
              }
            }
            return cloudfunctions.deleteFunction({
              projectId: projectId,
              region: region,
              functionName: functionName,
            });
          };
        } else {
          retryFunction = async function() {
            return cloudfunctions.deleteFunction({
              projectId: projectId,
              region: region,
              functionName: functionName,
            });
          };
        }
        deployments.push({
          name: name,
          retryFunction: retryFunction,
        });
      });
    } else {
      if (deployments.length !== 0) {
        utils.logBullet(clc.bold.cyan("functions: ") + "continuing with other deployments.");
      }
    }
  }
  // filter out functions that are excluded via --only and --except flags
  const functionsInDeploy = functionsInfo.filter((trigger) => {
    return functionFilterGroups.length > 0 ? _.includes(deleteReleaseNames, trigger.name) : true;
  });
  await createOrUpdateSchedulesAndTopics(
    context.projectId,
    functionsInDeploy,
    existingScheduledFunctions,
    appEngineLocation
  );
  const allOps = await utils.promiseAllSettled(
    _.map(deployments, async (op) => {
      const res = await op.retryFunction();
      return _.merge(op, res);
    })
  );
  const failedCalls = _.chain(allOps)
    .filter({ state: "rejected" })
    .map("reason")
    .value();
  const successfulCalls = _.chain(allOps)
    .filter({ state: "fulfilled" })
    .map("value")
    .value();
  failedDeployments = failedCalls.map((error) => _.get(error, "context.function", ""));

  await setTriggerUrls(projectId, successfulCalls, sourceUrl);

  await helper.pollDeploys(successfulCalls, printSuccess, printFail, printTooManyOps, projectId);
  if (deployments.length > 0) {
    track("Functions Deploy (Result)", "failure", failedDeployments.length);
    track("Functions Deploy (Result)", "success", deployments.length - failedDeployments.length);
  }

  if (failedDeployments.length > 0) {
    logger.info("\n\nFunctions deploy had errors with the following functions:");
    const sortedFailedDeployments = failedDeployments.sort();
    for (let i = 0; i < sortedFailedDeployments.length; i++) {
      logger.info(`\t${sortedFailedDeployments[i]}`);
    }
    logger.info("\n\nTo try redeploying those functions, run:");
    logger.info(
      "    " +
        clc.bold("firebase deploy --only ") +
        clc.bold('"') +
        clc.bold(
          sortedFailedDeployments.map((name) => `functions:${name.replace(/-/g, ".")}`).join(",")
        ) +
        clc.bold('"')
    );
    logger.info("\n\nTo continue deploying other features (such as database), run:");
    logger.info("    " + clc.bold("firebase deploy --except functions"));
    throw new FirebaseError("Functions did not deploy properly.");
  }
}
