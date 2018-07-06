"use strict";
var clc = require("cli-color");
var _ = require("lodash");

var Command = require("../lib/command");
var gcp = require("../lib/gcp");
var pollKits = require("../lib/kits/pollKits");
var getProjectId = require("../lib/getProjectId");
var prompt = require("../lib/prompt");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var utils = require("../lib/utils");

var DEFAULT_REGION = gcp.cloudfunctions.DEFAULT_REGION;

function _getFunctions(dict, kitName) {
  return _.reduce(
    dict[kitName],
    function(funcs, func) {
      return _.concat(funcs, func.functions);
    },
    []
  );
}

function _listKits(projectId) {
  return gcp.cloudfunctions.list(projectId, DEFAULT_REGION).then(function(functions) {
    return _.chain(functions)
      .filter(function(func) {
        return _.has(func, "labels.goog-kit-name");
      })
      .map(function(funcInfo) {
        return {
          kit: funcInfo.labels["goog-kit-name"],
          source: funcInfo.labels["goog-kit-source"],
          functions: funcInfo.functionName,
        };
      })
      .groupBy("kit")
      .value();
  });
}

function _promptForKitsUninstall(choices, dict) {
  return prompt({}, [
    {
      type: "checkbox",
      name: "kitNames",
      message:
        "Which kits would you like to delete? " +
        "The source of each kit is listed after the kit name.",
      choices: prompt.convertLabeledListChoices(choices),
    },
  ]).then(function(list) {
    if (_.isEmpty(list.kitNames)) {
      return utils.reject("Please select at least one kit to delete", {
        exit: 1,
      });
    }
    return _.chain(list.kitNames)
      .map(function(key) {
        return prompt.listLabelToValue(key, choices);
      })
      .map(function(kit) {
        return _getFunctions(dict, kit);
      })
      .value();
  });
}

function _deleteKitFunctions(projectId, functions) {
  return Promise.all(
    _.map(functions, function(funcName) {
      return gcp.cloudfunctions.delete({
        projectId: projectId,
        region: DEFAULT_REGION,
        functionName: funcName,
      });
    })
  );
}

module.exports = new Command("kits:uninstall [kitName]")
  .description("Command to uninstall function kit")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(kitName, options) {
    var projectId = getProjectId(options);
    return _listKits(projectId)
      .then(function(dict) {
        if (_.isEmpty(dict)) {
          return utils.reject("There are no kits asssociated with your project.", { exit: 1 });
        }

        if (kitName) {
          if (!dict[kitName]) {
            return utils.reject("Could not find kit named " + clc.bold(kitName), { exit: 1 });
          }
          return _getFunctions(dict, kitName);
        }
        var choices = _.map(dict, function(kit, key) {
          return {
            name: key,
            label: key + ": " + kit[0].source,
            checked: false,
          };
        });
        return _promptForKitsUninstall(choices, dict);
      })
      .then(function(funcsToDelete) {
        utils.logBullet(clc.cyan.bold("kits: ") + "Deleting kits now...");
        return _deleteKitFunctions(projectId, _.flatten(funcsToDelete));
      })
      .then(function(operations) {
        utils.logBullet(
          clc.cyan.bold("kits: ") + "Checking to make sure kits have been deleted safely..."
        );

        var printSuccess = function(kits) {
          return utils.logSuccess(
            clc.green.bold("kits: ") +
              "Successfully deleted the following kit(s): " +
              clc.bold(_.uniq(kits))
          );
        };

        var printFail = function(reason) {
          return utils.logWarning(
            clc.yellow.bold("kits: ") + "Failed to delete the following kit: " + reason
          );
        };

        return pollKits(operations, printSuccess, printFail);
      });
  });
