"use strict";

/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */

const clc = require("cli-color");
const _ = require("lodash");

const { FirebaseError } = require("../../error");
const gcp = require("../../gcp");
const logger = require("../../logger");
const track = require("../../track");
const utils = require("../../utils");
const helper = require("../../functionsDeployHelper");
const runtimeSelector = require("../../runtimeChoiceSelector");
const { getAppEngineLocation } = require("../../functionsConfig");
const { promptOnce } = require("../../prompt");
const { createOrUpdateSchedulesAndTopics } = require("./createOrUpdateSchedulesAndTopics");

const deploymentTool = require("../../deploymentTool");
const timings = {};
let deployments = [];
let failedDeployments = [];

const DEFAULT_PUBLIC_POLICY = {
  version: 3,
  bindings: [
    {
      role: "roles/cloudfunctions.invoker",
      members: ["allUsers"],
    },
  ],
};

function _startTimer(name, type) {
  timings[name] = { type: type, t0: process.hrtime() };
}

function _endTimer(name) {
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

function _fetchTriggerUrls(projectId, ops, sourceUrl) {
  if (!_.find(ops, ["trigger.httpsTrigger", {}])) {
    // No HTTPS functions being deployed
    return Promise.resolve();
  }
  return gcp.cloudfunctions.listAll(projectId).then(function(functions) {
    const httpFunctions = _.chain(functions)
      .filter({ sourceUploadUrl: sourceUrl })
      .filter("httpsTrigger")
      .value();
    _.forEach(httpFunctions, function(httpFunc) {
      _.chain(ops)
        .find({ func: httpFunc.name })
        .assign({ triggerUrl: httpFunc.httpsTrigger.url })
        .value();
    });
    return Promise.resolve();
  });
}

const printSuccess = function(op) {
  _endTimer(op.func);
  utils.logSuccess(
    clc.bold.green("functions[" + helper.getFunctionLabel(op.func) + "]: ") +
      "Successful " +
      op.type +
      " operation. "
  );
  if (op.triggerUrl && op.type !== "delete") {
    logger.info(
      clc.bold("Function URL"),
      "(" + helper.getFunctionName(op.func) + "):",
      op.triggerUrl
    );
  }
};
const printFail = function(op) {
  _endTimer(op.func);
  failedDeployments.push(helper.getFunctionName(op.func));
  utils.logWarning(
    clc.bold.yellow("functions[" + helper.getFunctionLabel(op.func) + "]: ") + "Deployment error."
  );
  if (op.error.code === 8) {
    logger.debug(op.error.message);
    logger.info(
      "You have exceeded your deployment quota, please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. Go to " +
        clc.underline("https://firebase.google.com/docs/cli/#deploy_specific_functions") +
        " to learn more."
    );
  } else {
    logger.info(op.error.message);
  }
};

const printTooManyOps = function(projectId) {
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
};

function releaseFunctions(context, options, uploadedNames, functionsInfo, attempt) {
  // Handle retries
  const maxRetries = Number(options.retry || 1);
  if (attempt > maxRetries) {
    logger.info("\n\n");
    utils.logWarning(
      clc.bold.yellow("functions: ") + `Failed to deploy all functions after ${maxRetries} times...`
    );
    return;
  }
  if (attempt > 0) {
    const suffix = attempt === 1 ? "st" : attempt === 2 ? "nd" : attempt === 3 ? "rd" : "th";
    logger.info("\n\n");
    utils.logBullet(
      clc.bold.cyan("functions: ") +
        `trying to deploy failed functions for the ${attempt}${suffix} time...`
    );
  }

  // Ensure globals are reset...
  deployments = [];
  failedDeployments = [];
  const projectId = context.projectId;
  const sourceUrl = context.uploadUrl;
  const appEngineLocation = getAppEngineLocation(context.firebaseConfig);
  // Used in CLI releases v3.4.0 to v3.17.6
  const legacySourceUrlTwo =
    "gs://" + "staging." + context.firebaseConfig.storageBucket + "/firebase-functions-source";
  // Used in CLI releases v3.3.0 and prior
  const legacySourceUrlOne = "gs://" + projectId + "-gcf/" + projectId;
  const functionFilterGroups = helper.getFilterGroups(options);
  let deleteReleaseNames;
  let existingScheduledFunctions;

  return Promise.resolve(context.existingFunctions)
    .then(function(existingFunctions) {
      const pluckName = function(functionObject) {
        return _.get(functionObject, "name"); // e.g.'projects/proj1/locations/us-central1/functions/func'
      };

      const existingNames = _.map(existingFunctions, pluckName);
      const isScheduled = function(functionObject) {
        return _.get(functionObject, "labels.deployment-scheduled") === "true";
      };
      existingScheduledFunctions = _.chain(existingFunctions)
        .filter(isScheduled)
        .map(pluckName)
        .value();
      const releaseNames = helper.getReleaseNames(
        uploadedNames,
        existingNames,
        functionFilterGroups
      );
      // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
      deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;

      helper.logFilters(existingNames, releaseNames, functionFilterGroups);

      // Create functions
      _.chain(uploadedNames)
        .difference(existingNames)
        .intersection(releaseNames)
        .forEach(function(name) {
          const functionInfo = _.find(functionsInfo, { name: name });
          const functionTrigger = helper.getFunctionTrigger(functionInfo);
          const functionName = helper.getFunctionName(name);
          const region = helper.getRegion(name);
          const runtime = context.runtimeChoice || helper.getDefaultRuntime();
          utils.logBullet(
            clc.bold.cyan("functions: ") +
              "creating " +
              runtimeSelector.getHumanFriendlyRuntimeName(runtime) +
              " function " +
              clc.bold(helper.getFunctionLabel(name)) +
              "..."
          );
          logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
          const eventType = functionTrigger.eventTrigger
            ? functionTrigger.eventTrigger.eventType
            : "https";
          _startTimer(name, "create");

          deployments.push({
            name: name,
            retryFunction: () => {
              return gcp.cloudfunctions
                .create({
                  projectId: projectId,
                  region: region,
                  eventType: eventType,
                  functionName: functionName,
                  entryPoint: functionInfo.entryPoint,
                  trigger: functionTrigger,
                  labels: _.assign({}, deploymentTool.labels, functionInfo.labels),
                  sourceUploadUrl: sourceUrl,
                  runtime: runtime,
                  availableMemoryMb: functionInfo.availableMemoryMb,
                  timeout: functionInfo.timeout,
                  maxInstances: functionInfo.maxInstances,
                })
                .then((createRes) => {
                  if (_.has(functionTrigger, "httpsTrigger")) {
                    logger.debug(`Setting public policy for function ${functionName}`);
                    return gcp.cloudfunctions
                      .setIamPolicy({
                        functionName,
                        projectId,
                        region,
                        policy: DEFAULT_PUBLIC_POLICY,
                      })
                      .then(() => {
                        return createRes;
                      });
                  }
                  return createRes;
                });
            },
            trigger: functionTrigger,
          });
        })
        .value();

      // Update functions
      _.chain(uploadedNames)
        .intersection(existingNames)
        .intersection(releaseNames)
        .forEach(function(name) {
          const functionInfo = _.find(functionsInfo, { name: name });
          const functionTrigger = helper.getFunctionTrigger(functionInfo);
          const functionName = helper.getFunctionName(name);
          const region = helper.getRegion(name);

          const eventType = functionTrigger.eventTrigger
            ? functionTrigger.eventTrigger.eventType
            : "https";
          const existingFunction = _.find(existingFunctions, {
            name: name,
          });
          const existingEventType = _.get(existingFunction, "eventTrigger.eventType");
          let migratingTrigger = false;
          if (
            eventType.match(/google.storage.object./) &&
            existingEventType === "providers/cloud.storage/eventTypes/object.change"
          ) {
            migratingTrigger = true;
          } else if (
            eventType === "google.pubsub.topic.publish" &&
            existingEventType === "providers/cloud.pubsub/eventTypes/topic.publish"
          ) {
            migratingTrigger = true;
          }
          if (migratingTrigger) {
            throw new FirebaseError(
              "Function " +
                clc.bold(functionName) +
                " was deployed using a legacy trigger type and cannot be updated without deleting " +
                "the previous function. Follow the instructions on " +
                clc.underline(
                  "https://firebase.google.com/docs/functions/manage-functions#modify-trigger"
                ) +
                " for how to change the trigger without losing events.\n"
            );
          } else {
            const options = {
              projectId: projectId,
              region: region,
              functionName: functionName,
              trigger: functionTrigger,
              sourceUploadUrl: sourceUrl,
              labels: _.assign({}, deploymentTool.labels, functionInfo.labels),
              availableMemoryMb: functionInfo.availableMemoryMb,
              timeout: functionInfo.timeout,
              maxInstances: functionInfo.maxInstances,
            };
            if (context.runtimeChoice) {
              options.runtime = context.runtimeChoice;
            }
            const runtime = options.runtime || _.get(existingFunction, "runtime", "nodejs6"); // legacy functions are Node 6
            utils.logBullet(
              clc.bold.cyan("functions: ") +
                "updating " +
                runtimeSelector.getHumanFriendlyRuntimeName(runtime) +
                " function " +
                clc.bold(helper.getFunctionLabel(name)) +
                "..."
            );
            logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
            _startTimer(name, "update");

            deployments.push({
              name: name,
              retryFunction: function() {
                return gcp.cloudfunctions.update(options);
              },
              trigger: functionTrigger,
            });
          }
        })
        .value();

      // Delete functions
      const functionsToDelete = _.chain(existingFunctions)
        .filter(function(functionInfo) {
          if (typeof functionInfo.labels === "undefined") {
            return (
              functionInfo.sourceArchiveUrl === legacySourceUrlOne ||
              functionInfo.sourceArchiveUrl === legacySourceUrlTwo
            );
          }
          return deploymentTool.check(functionInfo.labels);
        }) // only delete functions uploaded via firebase-tools
        .map(pluckName)
        .difference(uploadedNames)
        .intersection(deleteReleaseNames)
        .value();

      if (functionsToDelete.length === 0) {
        return Promise.resolve();
      }
      const deleteList = _.map(functionsToDelete, function(func) {
        return "\t" + helper.getFunctionLabel(func);
      }).join("\n");

      if (options.nonInteractive && !options.force) {
        const deleteCommands = _.map(functionsToDelete, function(func) {
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
            clc.underline(
              "https://firebase.google.com/docs/functions/manage-functions#modify" + "\n"
            )
        );
      }

      const next = options.force
        ? Promise.resolve(true)
        : promptOnce({
            type: "confirm",
            name: "confirm",
            default: false,
            message:
              "Would you like to proceed with deletion? Selecting no will continue the rest of the deployments.",
          });

      return next.then(function(proceed) {
        if (!proceed) {
          if (deployments.length !== 0) {
            utils.logBullet(clc.bold.cyan("functions: ") + "continuing with other deployments.");
          }
          return;
        }
        functionsToDelete.forEach(function(name) {
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
          _startTimer(name, "delete");
          let retryFunction;
          const isScheduledFunction = _.includes(existingScheduledFunctions, name);
          if (isScheduledFunction) {
            retryFunction = function() {
              return gcp.cloudscheduler
                .deleteJob(scheduleName)
                .catch((err) => {
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
                })
                .then(() => {
                  return gcp.pubsub.deleteTopic(topicName);
                })
                .catch((err) => {
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
                })
                .then(() => {
                  return gcp.cloudfunctions.delete({
                    projectId: projectId,
                    region: region,
                    functionName: functionName,
                  });
                });
            };
          } else {
            retryFunction = function() {
              return gcp.cloudfunctions.delete({
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
      });
    })
    .then(function() {
      // filter out functions that are excluded via --only and --except flags
      const functionsInDeploy = functionsInfo.filter((trigger) => {
        return functionFilterGroups.length > 0
          ? _.includes(deleteReleaseNames, trigger.name)
          : true;
      });
      return createOrUpdateSchedulesAndTopics(
        context.projectId,
        functionsInDeploy,
        existingScheduledFunctions,
        appEngineLocation
      );
    })
    .then(function() {
      return utils.promiseAllSettled(
        _.map(deployments, function(op) {
          return op.retryFunction().then(function(res) {
            return _.merge(op, res);
          });
        })
      );
    })
    .then(function(allOps) {
      const failedCalls = _.chain(allOps)
        .filter({ state: "rejected" })
        .map("reason")
        .value();
      const successfulCalls = _.chain(allOps)
        .filter({ state: "fulfilled" })
        .map("value")
        .value();
      failedDeployments = failedCalls.map((error) => _.get(error, "context.function", ""));
      const hasQuotaError = failedCalls.some(
        (error) => _.get(error, "context.response.statusCode") === 429
      );
      const allDeploymentsFailed = deployments.length === failedDeployments.length;

      return _fetchTriggerUrls(projectId, successfulCalls, sourceUrl)
        .then(function() {
          return helper.pollDeploys(
            successfulCalls,
            printSuccess,
            printFail,
            printTooManyOps,
            projectId
          );
        })
        .then(() => {
          if (deployments.length > 0) {
            track("Functions Deploy (Result)", "failure", failedDeployments.length);
            track(
              "Functions Deploy (Result)",
              "success",
              deployments.length - failedDeployments.length
            );
          }
          if (failedDeployments.length > 0) {
            logger.info("\n\nFunctions deploy had errors with the following functions:");
            const sortedFailedDeployments = failedDeployments.sort();
            for (let i = 0; i < sortedFailedDeployments.length; i++) {
              logger.info(`\t${sortedFailedDeployments[i]}`);
            }

            // Try redeploying failed functions
            if (
              !allDeploymentsFailed &&
              !hasQuotaError &&
              !!options.retry &&
              attempt <= maxRetries
            ) {
              // Reconstruct names of functions for the current project
              const fullFunctionsNames = failedDeployments.map((name) =>
                ["projects", projectId, "locations", "us-central1", "functions", name].join("/")
              );
              // Update the options to "--only" deploy the functions to redeploy
              // because this is used to compute the filter groups and prevent deletions
              // They must be mapped as functions:<namespace>.<function-name>,...
              const updatedOpts = Object.assign({}, options, {
                only: failedDeployments
                  .map((name) => `functions:${name.split("-").join(".")}`)
                  .join(","),
              });
              return releaseFunctions(
                context,
                updatedOpts,
                fullFunctionsNames,
                functionsInfo,
                attempt + 1
              );
            }

            logger.info("\n\nTo try redeploying those functions, run:");
            logger.info(
              "    " +
                clc.bold("firebase deploy --only ") +
                clc.bold(sortedFailedDeployments.map((name) => `functions:${name}`).join(","))
            );
            logger.info("\n\nTo continue deploying other features (such as database), run:");
            logger.info("    " + clc.bold("firebase deploy --except functions"));
            return Promise.reject(new FirebaseError("Functions did not deploy properly."));
          }
        });
    });
}

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  let functionsInfo = helper.getFunctionsInfo(payload.functions.triggers, context.projectId);
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

  delete payload.functions;
  return releaseFunctions(context, options, uploadedNames, functionsInfo, 0);
};
