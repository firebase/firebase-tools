"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var FirebaseError = require("./error");
var logger = require("./logger");
var track = require("./track");
var utils = require("./utils");
var cloudfunctions = require("./gcp/cloudfunctions");
var pollOperations = require("./pollOperations");

function functionMatchesGroup(functionName, groupChunks) {
  return _.isEqual(
    groupChunks,
    _.last(functionName.split("/"))
      .split("-")
      .slice(0, groupChunks.length)
  );
}

function getFilterGroups(options) {
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

function getReleaseNames(uploadNames, existingNames, functionFilterGroups) {
  if (functionFilterGroups.length === 0) {
    return uploadNames;
  }

  var allFunctions = _.union(uploadNames, existingNames);
  return _.filter(allFunctions, function(functionName) {
    return _.some(
      _.map(functionFilterGroups, function(groupChunks) {
        return functionMatchesGroup(functionName, groupChunks);
      })
    );
  });
}

function logFilters(existingNames, releaseNames, functionFilterGroups) {
  if (functionFilterGroups.length === 0) {
    return;
  }

  logger.debug("> [functions] filtering triggers to: " + JSON.stringify(releaseNames, null, 2));
  track("Functions Deploy with Filter", "", releaseNames.length);

  if (existingNames.length > 0) {
    var list = _.map(existingNames, function(name) {
      return getFunctionName(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(clc.bold.cyan("functions: ") + "current functions in project: " + list);
  }
  if (releaseNames.length > 0) {
    var list = _.map(releaseNames, function(name) {
      return getFunctionName(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(clc.bold.cyan("functions: ") + "uploading functions in project: " + list);
  }

  var allFunctions = _.union(releaseNames, existingNames);
  var unmatchedFilters = _.chain(functionFilterGroups)
    .filter(function(filterGroup) {
      return !_.some(
        _.map(allFunctions, function(functionName) {
          return functionMatchesGroup(functionName, filterGroup);
        })
      );
    })
    .map(function(group) {
      return group.join("-");
    })
    .value();
  if (unmatchedFilters.length > 0) {
    utils.logWarning(
      clc.bold.yellow("functions: ") +
        "the following filters were specified but do not match any functions in the project: " +
        unmatchedFilters.join(", ")
    );
  }
}

function getFunctionsInfo(parsedTriggers, projectId) {
  var functionsInfo = [];
  _.forEach(parsedTriggers, function(trigger) {
    if (!trigger.regions) {
      trigger.regions = ["us-central1"];
    }
    // SDK exports list of regions for each function to be deployed to, need to add a new entry
    // to functionsInfo for each region.
    _.forEach(trigger.regions, function(region) {
      functionsInfo.push(
        _.chain(trigger)
          .omit("regions")
          .assign({
            name: ["projects", projectId, "locations", region, "functions", trigger.name].join("/"),
          })
          .value()
      );
    });
  });
  return functionsInfo;
}

function getFunctionTrigger(functionInfo) {
  if (functionInfo.httpsTrigger) {
    return _.pick(functionInfo, "httpsTrigger");
  } else if (functionInfo.eventTrigger) {
    var trigger = functionInfo.eventTrigger;
    return { eventTrigger: trigger };
  }
  logger.debug("Unknown trigger type found in:", functionInfo);
  return new FirebaseError("Could not parse function trigger, unknown trigger type.");
}

function getFunctionName(fullName) {
  return fullName.split("/")[5];
}

function getRegion(fullName) {
  return fullName.split("/")[3];
}

function getFunctionLabel(fullName) {
  return getFunctionName(fullName) + "(" + getRegion(fullName) + ")";
}

function pollDeploys(operations, printSuccess, printFail, printTooManyOps, projectId) {
  var interval;
  // Poll less frequently when there are many operations to avoid hitting read quota.
  // See "Read requests" quota at https://cloud.google.com/console/apis/api/cloudfunctions/quotas
  if (_.size(operations) > 90) {
    printTooManyOps(projectId);
    return Promise.resolve();
  } else if (_.size(operations) > 40) {
    interval = 10 * 1000;
  } else if (_.size(operations) > 15) {
    interval = 5 * 1000;
  } else {
    interval = 2 * 1000;
  }
  var pollFunction = cloudfunctions.check;

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
  return pollOperations
    .pollAndRetry(operations, pollFunction, interval, printSuccess, printFail, retryCondition)
    .catch(function() {
      utils.logWarning(
        clc.bold.yellow("functions:") + " failed to get status of all the deployments"
      );
      logger.info(
        "You can check on their status at " + utils.consoleUrl(projectId, "/functions/logs")
      );
      return Promise.reject(new FirebaseError("Failed to get status of functions deployments."));
    });
}

function getRuntimeName(runtime) {
  if (runtime === "nodejs8") {
    return "Node.js 8";
  }
  if (runtime === "nodejs6") {
    return "Node.js 6";
  }
  return runtime;
}

function getDefaultRuntime() {
  // TODO uncomment when Node.js v8 is the default.
  /**
function getDefaultRuntime(options)
  var packageJsonPath = path.join(
    options.config.path(options.config.get("functions.source")),
    "package.json"
  );
  var loaded = require(packageJsonPath);
  var SDKRange = _.get(loaded, "dependencies.firebase-functions");
  try {
    if (!semver.intersects(SDKRange, ">=2")) {
      utils.logWarning(
        clc.bold.yellow("functions: ") +
          "Deploying functions to Node 6 runtime. Please note that Node 8 is also available and is the recommended runtime. " +
          "However, you must have a " +
          clc.bold("firebase-functions") +
          " version that is at least 2.0.0. Please run " +
          clc.bold("npm i --save firebase-functions@latest") +
          " in the functions folder and add an " +
          clc.bold("engines") +
          " field to " +
          clc.bold("functions/package.json") +
          " with the value " +
          clc.bold('{"node": "8"}')
      );
      return "nodejs6";
    }
    return "nodejs8";
  } catch (e) {
    // semver check will fail if a URL is used instead of a version number, in that case stay safe and return Node 6 as default.
    return "nodejs6";
  }
  **/
  return "nodejs6";
}

module.exports = {
  getFilterGroups: getFilterGroups,
  getReleaseNames: getReleaseNames,
  logFilters: logFilters,
  getFunctionsInfo: getFunctionsInfo,
  getFunctionTrigger: getFunctionTrigger,
  getFunctionName: getFunctionName,
  getRegion: getRegion,
  functionMatchesGroup: functionMatchesGroup,
  getFunctionLabel: getFunctionLabel,
  pollDeploys: pollDeploys,
  getRuntimeName: getRuntimeName,
  getDefaultRuntime: getDefaultRuntime,
};
