"use strict";

var _ = require("lodash");
var chalk = require("chalk");

var FirebaseError = require("./error");
var logger = require("./logger");
var track = require("./track");
var utils = require("./utils");

function _functionMatchesGroup(functionName, groupChunks) {
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
        return _functionMatchesGroup(functionName, groupChunks);
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
    utils.logBullet(chalk.bold.cyan("functions: ") + "current functions in project: " + list);
  }
  if (releaseNames.length > 0) {
    var list = _.map(releaseNames, function(name) {
      return getFunctionName(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(chalk.bold.cyan("functions: ") + "uploading functions in project: " + list);
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

module.exports = {
  getFilterGroups: getFilterGroups,
  getReleaseNames: getReleaseNames,
  logFilters: logFilters,
  getFunctionsInfo: getFunctionsInfo,
  getFunctionTrigger: getFunctionTrigger,
  getFunctionName: getFunctionName,
  getRegion: getRegion,
  getFunctionLabel: getFunctionLabel,
};
