"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var cloudfunctions = require("./gcp/cloudfunctions");
var helper = require("./functionsDeployHelper");
var logger = require("./logger");
var track = require("./track");
var utils = require("./utils");

var deletes = [];
var failedDeployments = 0;

var printSuccess = function(op) {
  utils.logSuccess(
    clc.bold.green("functions[" + helper.getFunctionLabel(op.func) + "]: ") +
      "Successful deletion. "
  );
};

var printFail = function(op) {
  failedDeployments += 1;
  utils.logWarning(
    clc.bold.yellow("functions[" + helper.getFunctionLabel(op.func) + "]: ") + "Deployment error."
  );
  if (op.error.code === 8) {
    logger.debug(op.error.message);
    logger.info(
      "You have exceeded your deployment quota, please delete your functions in smaller batches " +
        "and wait a few minutes before trying again."
    );
  } else {
    logger.info(op.error.message);
  }
};

var printTooManyOps = function(projectId) {
  utils.logWarning(
    clc.bold.yellow("functions:") +
      " too many functions are being deleted at once, cannot poll status."
  );
  logger.info(
    "In a few minutes, you can check status at " + utils.consoleUrl(projectId, "/functions/logs")
  );
  deletes = []; // prevents analytics tracking of deployments
};

module.exports = function(functionsToDelete, projectId) {
  deletes = _.map(functionsToDelete, function(name) {
    return {
      name: name,
      retryFunction: function() {
        return cloudfunctions.delete({
          projectId: projectId,
          region: helper.getRegion(name),
          functionName: helper.getFunctionName(name),
        });
      },
    };
  });

  return utils
    .promiseAllSettled(
      _.map(deletes, function(op) {
        return op.retryFunction().then(function(res) {
          return _.merge(op, res);
        });
      })
    )
    .then(function(operations) {
      var successfulCalls = _.chain(operations)
        .filter({ state: "fulfilled" })
        .map("value")
        .value();

      var failedCalls = _.chain(operations)
        .filter({ state: "rejected" })
        .map("reason")
        .value();

      failedDeployments += failedCalls.length;

      return helper
        .pollDeploys(successfulCalls, printSuccess, printFail, printTooManyOps, projectId)
        .then(function() {
          if (deletes.length > 0) {
            track("Functions Deploy (Result)", "failure", failedDeployments);
            track("Functions Deploy (Result)", "success", deletes.length - failedDeployments);
          }
        });
    });
};
