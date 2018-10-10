"use strict";

var _ = require("lodash");

var clc = require("cli-color");
var Command = require("../lib/command");
var functionsConfig = require("../lib/functionsConfig");
var getProjectId = require("../lib/getProjectId");
var logger = require("../lib/logger");
var requirePermissions = require("../lib/requirePermissions");
var utils = require("../lib/utils");
var runtimeconfig = require("../lib/gcp/runtimeconfig");

module.exports = new Command("functions:config:unset [keys...]")
  .description("unset environment config at the specified path(s)")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.create",
    "runtimeconfig.configs.get",
    "runtimeconfig.configs.update",
    "runtimeconfig.configs.delete",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.create",
    "runtimeconfig.variables.get",
    "runtimeconfig.variables.update",
    "runtimeconfig.variables.delete",
  ])
  .before(functionsConfig.ensureApi)
  .action(function(args, options) {
    if (!args.length) {
      return utils.reject("Must supply at least one key");
    }
    var projectId = getProjectId(options);
    var parsed = functionsConfig.parseUnsetArgs(args);
    return Promise.all(
      _.map(parsed, function(item) {
        if (item.varId === "") {
          return runtimeconfig.configs.delete(projectId, item.configId);
        }
        return runtimeconfig.variables.delete(projectId, item.configId, item.varId);
      })
    ).then(function() {
      utils.logSuccess("Environment updated.");
      logger.info(
        "\nPlease deploy your functions for the change to take effect by running " +
          clc.bold("firebase deploy --only functions") +
          "\n"
      );
    });
  });
