"use strict";

/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */

var clc = require("cli-color");
var _ = require("lodash");

var { FirebaseError } = require("../../error");
var gcp = require("../../gcp");
var logger = require("../../logger");
var track = require("../../track");
var utils = require("../../utils");
var helper = require("../../functionsDeployHelper");
var friendlyRuntimeName = require("../../parseRuntimeAndValidateSDK").getHumanFriendlyRuntimeName;
var { getAppEngineLocation } = require("../../functionsConfig");
var { promptOnce } = require("../../prompt");
var { createOrUpdateSchedulesAndTopics } = require("./createOrUpdateSchedulesAndTopics");

var deploymentTool = require("../../deploymentTool");
var timings = {};
var deployments = [];
var failedDeployments = [];

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
  var duration = process.hrtime(timings[name].t0);
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
    var httpFunctions = _.chain(functions)
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

var printSuccess = function(op) {
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
var printFail = function(op) {
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

var printTooManyOps = function(projectId) {
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

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  var projectId = context.projectId;
  var sourceUrl = context.uploadUrl;

  // Reset module-level variables to prevent duplicate deploys when using firebase-tools as an import.
  timings = {};
  deployments = [];
  failedDeployments = [];

  var appEngineLocation = getAppEngineLocation(context.firebaseConfig);
  var functionsInfo = helper.getFunctionsInfo(payload.functions.triggers, projectId);
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
  var uploadedNames = _.map(functionsInfo, "name");
  var runtime = context.runtimeChoice;
  var functionFilterGroups = helper.getFilterGroups(options);
  var deleteReleaseNames;
  var existingScheduledFunctions;

  // Collect all the functions that have a retry policy
  var failurePolicyFunctions = functionsInfo.filter((fn) => {
    return !!fn.failurePolicy;
  });

  let proceedPrompt = Promise.resolve(true);
  if (failurePolicyFunctions.length) {
    var failurePolicyFunctionLabels = failurePolicyFunctions.map((fn) => {
      return helper.getFunctionLabel(_.get(fn, "name"));
    });
    var retryMessage =
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
      proceedPrompt = promptOnce({
        type: "confirm",
        name: "confirm",
        default: false,
        message: "Would you like to proceed with deployment?",
      });
    }
  }

  delete payload.functions;

  return proceedPrompt
    .then((proceed) => {
      if (!proceed) {
        throw new FirebaseError("Deployment canceled.", { exit: 1 });
      }

      return Promise.resolve(context.existingFunctions);
    })
    .then(function(existingFunctions) {
      var pluckName = function(functionObject) {
        return _.get(functionObject, "name"); // e.g.'projects/proj1/locations/us-central1/functions/func'
      };

      var existingNames = _.map(existingFunctions, pluckName);
      var isScheduled = function(functionObject) {
        return _.get(functionObject, "labels.deployment-scheduled") === "true";
      };
      existingScheduledFunctions = _.chain(existingFunctions)
        .filter(isScheduled)
        .map(pluckName)
        .value();
      var releaseNames = helper.getReleaseNames(uploadedNames, existingNames, functionFilterGroups);
      // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
      deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;
      helper.logFilters(existingNames, releaseNames, functionFilterGroups);

      const defaultEnvVariables = {
        FIREBASE_CONFIG: JSON.stringify(context.firebaseConfig),
      };

      // Create functions
      _.chain(uploadedNames)
        .difference(existingNames)
        .intersection(releaseNames)
        .forEach(function(name) {
          var functionInfo = _.find(functionsInfo, { name: name });
          var functionTrigger = helper.getFunctionTrigger(functionInfo);
          var functionName = helper.getFunctionName(name);
          var region = helper.getRegion(name);
          utils.logBullet(
            clc.bold.cyan("functions: ") +
              "creating " +
              friendlyRuntimeName(runtime) +
              " function " +
              clc.bold(helper.getFunctionLabel(name)) +
              "..."
          );
          logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
          var eventType = functionTrigger.eventTrigger
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
                  environmentVariables: defaultEnvVariables,
                  vpcConnector: functionInfo.vpcConnector,
                  vpcConnectorEgressSettings: functionInfo.vpcConnectorEgressSettings,
                  serviceAccountEmail: functionInfo.serviceAccountEmail,
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
          var functionInfo = _.find(functionsInfo, { name: name });
          var functionTrigger = helper.getFunctionTrigger(functionInfo);
          var functionName = helper.getFunctionName(name);
          var region = helper.getRegion(name);
          var existingFunction = _.find(existingFunctions, {
            name: name,
          });
          var options = {
            projectId: projectId,
            region: region,
            functionName: functionName,
            trigger: functionTrigger,
            sourceUploadUrl: sourceUrl,
            labels: _.assign({}, deploymentTool.labels, functionInfo.labels),
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
          utils.logBullet(
            clc.bold.cyan("functions: ") +
              "updating " +
              friendlyRuntimeName(runtime) +
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
        })
        .value();

      // Delete functions
      var functionsToDelete = _.chain(existingFunctions)
        .filter(function(functionInfo) {
          return deploymentTool.check(functionInfo.labels);
        }) // only delete functions uploaded via firebase-tools
        .map(pluckName)
        .difference(uploadedNames)
        .intersection(deleteReleaseNames)
        .value();

      if (functionsToDelete.length === 0) {
        return Promise.resolve();
      }
      var deleteList = _.map(functionsToDelete, function(func) {
        return "\t" + helper.getFunctionLabel(func);
      }).join("\n");

      if (options.nonInteractive && !options.force) {
        var deleteCommands = _.map(functionsToDelete, function(func) {
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
          var functionName = helper.getFunctionName(name);
          var scheduleName = helper.getScheduleName(name, appEngineLocation);
          var topicName = helper.getTopicName(name);
          var region = helper.getRegion(name);

          utils.logBullet(
            clc.bold.cyan("functions: ") +
              "deleting function " +
              clc.bold(helper.getFunctionLabel(name)) +
              "..."
          );
          _startTimer(name, "delete");
          var retryFunction;
          var isScheduledFunction = _.includes(existingScheduledFunctions, name);
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
      var functionsInDeploy = functionsInfo.filter((trigger) => {
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
      var failedCalls = _.chain(allOps)
        .filter({ state: "rejected" })
        .map("reason")
        .value();
      var successfulCalls = _.chain(allOps)
        .filter({ state: "fulfilled" })
        .map("value")
        .value();
      failedDeployments = failedCalls.map((error) => _.get(error, "context.function", ""));

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
            logger.info("\n\nTo try redeploying those functions, run:");
            logger.info(
              "    " +
                clc.bold("firebase deploy --only ") +
                clc.bold('"') +
                clc.bold(
                  sortedFailedDeployments
                    .map((name) => `functions:${name.replace(/-/g, ".")}`)
                    .join(",")
                ) +
                clc.bold('"')
            );
            logger.info("\n\nTo continue deploying other features (such as database), run:");
            logger.info("    " + clc.bold("firebase deploy --except functions"));
            return Promise.reject(new FirebaseError("Functions did not deploy properly."));
          }
        });
    });
};
