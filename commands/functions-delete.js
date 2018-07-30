"use strict";

var _ = require("lodash");

var Command = require("../lib/command");
var clc = require("cli-color");
var cloudfunctions = require("../lib/gcp/cloudfunctions");
var functionsDelete = require("../lib/functionsDelete");
var getProjectId = require("../lib/getProjectId");
var helper = require("../lib/functionsDeployHelper");
var prompt = require("../lib/prompt");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var utils = require("../lib/utils");

module.exports = new Command("functions:delete [filters...]")
  .description("delete one or more Cloud Functions by name or group name.")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. "
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(filters, options) {
    if (!filters.length) {
      return utils.reject("Must supply at least function or group name.");
    }

    var projectId = getProjectId(options);
    var functionsToDelete = [];

    // Dot notation can be used to indicate function inside of a group
    var filterChunks = _.map(filters, function(filter) {
      return filter.split(".");
    });

    return cloudfunctions
      .listAll(projectId)
      .then(function(result) {
        var allFunctions = _.map(result, "name");
        return _.filter(allFunctions, function(name) {
          var regionMatches = options.region ? helper.getRegion(name) === options.region : true;
          var nameMatches = _.some(
            _.map(filterChunks, function(chunk) {
              return helper.functionMatchesGroup(name, chunk);
            })
          );
          return regionMatches && nameMatches;
        });
      })
      .then(function(result) {
        functionsToDelete = result;
        if (functionsToDelete.length === 0) {
          return utils.reject(
            "The specified filters do not match any existing functions in project " +
              clc.bold(projectId) +
              ".",
            { exit: 1 }
          );
        }
        var deleteList = _.map(functionsToDelete, function(func) {
          return "\t" + helper.getFunctionLabel(func);
        }).join("\n");
        if (!options.force) {
          return prompt(options, [
            {
              type: "confirm",
              name: "confirm",
              default: false,
              message:
                "You are about to delete the following Cloud Functions:\n" +
                deleteList +
                "\n  Are you sure?",
            },
          ]);
        }
      })
      .then(function() {
        if (!(options.confirm || options.force)) {
          return utils.reject("Command aborted.", { exit: 1 });
        }
        return functionsDelete(functionsToDelete, projectId);
      });
  });
