"use strict";

var chalk = require("chalk");
var _ = require("lodash");

var FirebaseError = require("../../error");
var gcp = require("../../gcp");
var logger = require("../../logger");
var track = require("../../track");
var utils = require("../../utils");
var pollOperation = require("../../pollOperations");

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  var GCP_REGION = gcp.cloudfunctions.DEFAULT_REGION;
  var projectId = context.projectId;
  var sourceUrl = context.uploadUrl;
  // Used in CLI releases v3.4.0 to v3.17.6
  var legacySourceUrlTwo =
    "gs://" + "staging." + context.firebaseConfig.storageBucket + "/firebase-functions-source";
  // Used in CLI releases v3.3.0 and prior
  var legacySourceUrlOne = "gs://" + projectId + "-gcf/" + projectId;
  var CLI_DEPLOYMENT_TOOL = "cli-firebase";
  var CLI_DEPLOYMENT_LABELS = {
    "deployment-tool": CLI_DEPLOYMENT_TOOL,
  };

  var functionsInfo = payload.functions.triggers;
  var uploadedNames = _.map(functionsInfo, "name");
  var timings = {};
  var failedDeployments = 0;
  var deployments = [];

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

  function _fetchTriggerUrls(ops) {
    if (!_.find(ops, ["trigger.httpsTrigger", {}])) {
      // No HTTPS functions being deployed
      return Promise.resolve();
    }
    return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(functions) {
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

  function _functionMatchesGroup(functionName, groupChunks) {
    return _.isEqual(groupChunks, functionName.split("-").slice(0, groupChunks.length));
  }

  function _getFilterGroups() {
    if (!options.only) {
      return [];
    }

    var opts;
    return _.chain(options.only.split(","))
      .filter(function(filter) {
        opts = filter.split(":");
        return opts[0] === "functions" && opts[1];
      })
      .map(function(filter) {
        return filter.split(":")[1].split(".");
      })
      .value();
  }

  function _getReleaseNames(uploadNames, existingNames, functionFilterGroups) {
    if (functionFilterGroups.length === 0) {
      return uploadNames;
    }

    var allFunctions = _.union(uploadNames, existingNames);
    return _.filter(allFunctions, function(functionName) {
      return _.some(
        _.map(functionFilterGroups, function(groupChunks) {
          return _functionMatchesGroup(functionName, groupChunks);
        })
      );
    });
  }

  function _logFilters(existingNames, releaseNames, functionFilterGroups) {
    if (functionFilterGroups.length === 0) {
      return;
    }

    logger.debug("> [functions] filtering triggers to: " + JSON.stringify(releaseNames, null, 2));
    track("Functions Deploy with Filter", "", releaseNames.length);

    if (existingNames.length > 0) {
      utils.logBullet(
        chalk.bold.cyan("functions: ") + "current functions in project: " + existingNames.join(", ")
      );
    }
    if (releaseNames.length > 0) {
      utils.logBullet(
        chalk.bold.cyan("functions: ") +
          "uploading functions in project: " +
          releaseNames.join(", ")
      );
    }

    var allFunctions = _.union(releaseNames, existingNames);
    var unmatchedFilters = _.chain(functionFilterGroups)
      .filter(function(filterGroup) {
        return !_.some(
          _.map(allFunctions, function(functionName) {
            return _functionMatchesGroup(functionName, filterGroup);
          })
        );
      })
      .map(function(group) {
        return group.join("-");
      })
      .value();
    if (unmatchedFilters.length > 0) {
      utils.logWarning(
        chalk.bold.yellow("functions: ") +
          "the following filters were specified but do not match any functions in the project: " +
          unmatchedFilters.join(", ")
      );
    }
  }

  function _pollAndManageOperations(operations) {
    var interval;
    // Poll less frequently when there are many operations to avoid hitting read quota.
    // See "Read requests" quota at https://cloud.google.com/console/apis/api/cloudfunctions/quotas
    if (_.size(operations) > 90) {
      utils.logWarning(
        chalk.bold.yellow("functions:") +
          " too many functions are being deployed, cannot poll status."
      );
      logger.info(
        "In a few minutes, you can check status at " +
          utils.consoleUrl(options.project, "/functions/logs")
      );
      logger.info(
        "You can use the --only flag to deploy only a portion of your functions in the future."
      );
      deployments = []; // prevents analytics tracking of deployments
      return Promise.resolve();
    } else if (_.size(operations) > 40) {
      interval = 10 * 1000;
    } else if (_.size(operations) > 15) {
      interval = 5 * 1000;
    } else {
      interval = 2 * 1000;
    }
    var pollFunction = gcp.cloudfunctions.check;
    var printSuccess = function(op) {
      _endTimer(op.functionName);
      utils.logSuccess(
        chalk.bold.green("functions[" + op.functionName + "]: ") +
          "Successful " +
          op.type +
          " operation. "
      );
      if (op.triggerUrl && op.type !== "delete") {
        logger.info(chalk.bold("Function URL"), "(" + op.functionName + "):", op.triggerUrl);
      }
    };
    var printFail = function(op) {
      _endTimer(op.functionName);
      failedDeployments += 1;
      utils.logWarning(
        chalk.bold.yellow("functions[" + op.functionName + "]: ") + "Deployment error."
      );
      if (op.error.code === 8) {
        logger.debug(op.error.message);
        logger.info(
          "You have exceeded your deployment quota, please deploy your functions in batches by using the --only flag, " +
            "and wait a few minutes before deploying again. Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more."
        );
      } else {
        logger.info(op.error.message);
      }
    };
    var retryCondition = function(result) {
      // The error codes from a Google.LongRunning operation follow google.rpc.Code format.

      var retryableCodes = [
        1, // cancelled by client
        4, // deadline exceeded
        10, // aborted (typically due to concurrency issue)
        14, // unavailable
      ];

      if (_.includes(retryableCodes, result.error.code)) {
        return true;
      }
      return false;
    };
    return pollOperation.pollAndRetry(
      operations,
      pollFunction,
      interval,
      printSuccess,
      printFail,
      retryCondition
    );
  }

  function _getFunctionTrigger(functionInfo) {
    if (functionInfo.httpsTrigger) {
      return _.pick(functionInfo, "httpsTrigger");
    } else if (functionInfo.eventTrigger) {
      var trigger = functionInfo.eventTrigger;
      return { eventTrigger: trigger };
    }
    logger.debug("Unknown trigger type found in:", functionInfo);
    return new FirebaseError("Could not parse function trigger, unknown trigger type.");
  }

  delete payload.functions;
  return gcp.cloudfunctions
    .list(projectId, GCP_REGION)
    .then(function(existingFunctions) {
      var pluckName = function(functionObject) {
        var fullName = _.get(functionObject, "name"); // e.g.'projects/proj1/locations/us-central1/functions/func'
        return _.last(fullName.split("/"));
      };

      var existingNames = _.map(existingFunctions, pluckName);
      var functionFilterGroups = _getFilterGroups();
      var releaseNames = _getReleaseNames(uploadedNames, existingNames, functionFilterGroups);
      // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
      var deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;

      _logFilters(existingNames, releaseNames, functionFilterGroups);

      // Create functions
      _.chain(uploadedNames)
        .difference(existingNames)
        .intersection(releaseNames)
        .forEach(function(functionName) {
          var functionInfo = _.find(functionsInfo, { name: functionName });
          var functionTrigger = _getFunctionTrigger(functionInfo);
          utils.logBullet(
            chalk.bold.cyan("functions: ") + "creating function " + chalk.bold(functionName) + "..."
          );
          logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
          var eventType = functionTrigger.eventTrigger
            ? functionTrigger.eventTrigger.eventType
            : "https";
          _startTimer(functionName, "create");

          deployments.push({
            functionName: functionName,
            retryFunction: function() {
              return gcp.cloudfunctions.create({
                projectId: projectId,
                region: GCP_REGION,
                eventType: eventType,
                functionName: functionName,
                entryPoint: functionInfo.entryPoint,
                trigger: functionTrigger,
                labels: CLI_DEPLOYMENT_LABELS,
                sourceUploadUrl: sourceUrl,
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
        .forEach(function(functionName) {
          var functionInfo = _.find(functionsInfo, { name: functionName });
          var functionTrigger = _getFunctionTrigger(functionInfo);
          utils.logBullet(
            chalk.bold.cyan("functions: ") + "updating function " + chalk.bold(functionName) + "..."
          );
          logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
          var eventType = functionTrigger.eventTrigger
            ? functionTrigger.eventTrigger.eventType
            : "https";
          var existingFunction = _.find(existingFunctions, {
            functionName: functionName,
          });
          var existingEventType = _.get(existingFunction, "eventTrigger.eventType");
          var migratingTrigger = false;
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
                chalk.bold(functionName) +
                " was deployed using a legacy " +
                "trigger type and cannot be updated with the new SDK. To proceed with this deployment, you must first delete the " +
                "function by visiting the Cloud Console at: https://console.cloud.google.com/functions/list?project=" +
                projectId +
                "\n\nTo avoid service interruption, you may wish to create an identical function with a different name before " +
                "deleting this function.\n"
            );
          } else {
            _startTimer(functionName, "update");
            deployments.push({
              functionName: functionName,
              retryFunction: function() {
                return gcp.cloudfunctions.update({
                  projectId: projectId,
                  region: GCP_REGION,
                  functionName: functionName,
                  trigger: functionTrigger,
                  sourceUploadUrl: sourceUrl,
                  labels: CLI_DEPLOYMENT_LABELS,
                });
              },
              trigger: functionTrigger,
            });
          }
        })
        .value();

      // Delete functions
      _.chain(existingFunctions)
        .filter(function(functionInfo) {
          if (typeof functionInfo.labels === "undefined") {
            return (
              functionInfo.sourceArchiveUrl === legacySourceUrlOne ||
              functionInfo.sourceArchiveUrl === legacySourceUrlTwo
            );
          }
          return functionInfo.labels["deployment-tool"] === CLI_DEPLOYMENT_TOOL;
        }) // only delete functions uploaded via firebase-tools
        .map(pluckName)
        .difference(uploadedNames)
        .intersection(deleteReleaseNames)
        .map(function(functionName) {
          utils.logBullet(
            chalk.bold.cyan("functions: ") + "deleting function " + chalk.bold(functionName) + "..."
          );
          _startTimer(functionName, "delete");
          deployments.push({
            functionName: functionName,
            retryFunction: function() {
              return gcp.cloudfunctions.delete({
                projectId: projectId,
                region: GCP_REGION,
                functionName: functionName,
              });
            },
          });
        })
        .value();

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
      failedDeployments += failedCalls.length;

      return _fetchTriggerUrls(successfulCalls)
        .then(function() {
          return _pollAndManageOperations(successfulCalls).catch(function() {
            utils.logWarning(
              chalk.bold.yellow("functions:") + " failed to get status of all the deployments"
            );
            logger.info(
              "You can check on their status at " +
                utils.consoleUrl(options.project, "/functions/logs")
            );
            return Promise.reject(
              new FirebaseError("Failed to get status of functions deployments.")
            );
          });
        })
        .then(function() {
          if (deployments.length > 0) {
            track("Functions Deploy (Result)", "failure", failedDeployments);
            track("Functions Deploy (Result)", "success", deployments.length - failedDeployments);
          }

          if (failedDeployments > 0) {
            logger.info(
              "\n\nFunctions deploy had errors. To continue deploying other features (such as database), run:"
            );
            logger.info("    " + chalk.bold("firebase deploy --except functions"));
            return Promise.reject(new FirebaseError("Functions did not deploy properly."));
          }
        });
    });
};
