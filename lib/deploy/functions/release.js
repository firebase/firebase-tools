"use strict";

var chalk = require("chalk");
var _ = require("lodash");

var FirebaseError = require("../../error");
var gcp = require("../../gcp");
var logger = require("../../logger");
var track = require("../../track");
var utils = require("../../utils");
var helper = require("../../functionsDeployHelper");

var CLI_DEPLOYMENT_TOOL = "cli-firebase";
var CLI_DEPLOYMENT_LABELS = {
  "deployment-tool": CLI_DEPLOYMENT_TOOL,
};
var timings = {};
var deployments = [];
var failedDeployments = 0;

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

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  var projectId = context.projectId;
  var sourceUrl = context.uploadUrl;
  // Used in CLI releases v3.4.0 to v3.17.6
  var legacySourceUrlTwo =
    "gs://" + "staging." + context.firebaseConfig.storageBucket + "/firebase-functions-source";
  // Used in CLI releases v3.3.0 and prior
  var legacySourceUrlOne = "gs://" + projectId + "-gcf/" + projectId;
  var functionsInfo = helper.getFunctionsInfo(payload.functions.triggers, projectId);
  var uploadedNames = _.map(functionsInfo, "name");

  delete payload.functions;
  return gcp.cloudfunctions
    .listAll(projectId)
    .then(function(existingFunctions) {
      var pluckName = function(functionObject) {
        return _.get(functionObject, "name"); // e.g.'projects/proj1/locations/us-central1/functions/func'
      };

      var existingNames = _.map(existingFunctions, pluckName);
      var functionFilterGroups = helper.getFilterGroups(options);
      var releaseNames = helper.getReleaseNames(uploadedNames, existingNames, functionFilterGroups);
      // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
      var deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;

      helper.logFilters(existingNames, releaseNames, functionFilterGroups);

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
            chalk.bold.cyan("functions: ") +
              "creating function " +
              chalk.bold(helper.getFunctionLabel(name)) +
              "..."
          );
          logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
          var eventType = functionTrigger.eventTrigger
            ? functionTrigger.eventTrigger.eventType
            : "https";
          _startTimer(name, "create");

          deployments.push({
            name: name,
            retryFunction: function() {
              return gcp.cloudfunctions.create({
                projectId: projectId,
                region: region,
                eventType: eventType,
                functionName: functionName,
                entryPoint: functionInfo.entryPoint,
                trigger: functionTrigger,
                labels: _.assign({}, CLI_DEPLOYMENT_LABELS, functionsInfo.labels),
                sourceUploadUrl: sourceUrl,
                availableMemoryMb: functionInfo.availableMemoryMb,
                timeout: functionInfo.timeout,
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

          utils.logBullet(
            chalk.bold.cyan("functions: ") +
              "updating function " +
              chalk.bold(helper.getFunctionLabel(name)) +
              "..."
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
            _startTimer(name, "update");
            deployments.push({
              name: name,
              retryFunction: function() {
                return gcp.cloudfunctions.update({
                  projectId: projectId,
                  region: region,
                  functionName: functionName,
                  trigger: functionTrigger,
                  sourceUploadUrl: sourceUrl,
                  labels: _.assign({}, CLI_DEPLOYMENT_LABELS, functionsInfo.labels),
                  availableMemoryMb: functionInfo.availableMemoryMb,
                  timeout: functionInfo.timeout,
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
        .map(function(name) {
          var functionName = helper.getFunctionName(name);
          var region = helper.getRegion(name);

          utils.logBullet(
            chalk.bold.cyan("functions: ") +
              "deleting function " +
              chalk.bold(helper.getFunctionLabel(name)) +
              "..."
          );
          _startTimer(name, "delete");
          deployments.push({
            name: name,
            retryFunction: function() {
              return gcp.cloudfunctions.delete({
                projectId: projectId,
                region: region,
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

      var printSuccess = function(op) {
        _endTimer(op.func);
        utils.logSuccess(
          chalk.bold.green("functions[" + helper.getFunctionLabel(op.func) + "]: ") +
            "Successful " +
            op.type +
            " operation. "
        );
        if (op.triggerUrl && op.type !== "delete") {
          logger.info(
            chalk.bold("Function URL"),
            "(" + helper.getFunctionName(op.func) + "):",
            op.triggerUrl
          );
        }
      };
      var printFail = function(op) {
        _endTimer(op.func);
        failedDeployments += 1;
        utils.logWarning(
          chalk.bold.yellow("functions[" + helper.getFunctionLabel(op.func) + "]: ") +
            "Deployment error."
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

      var printTooManyOps = function() {
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
      };

      return _fetchTriggerUrls(projectId, successfulCalls, sourceUrl)
        .then(function() {
          return helper.pollDeploys(successfulCalls, printSuccess, printFail, printTooManyOps);
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
