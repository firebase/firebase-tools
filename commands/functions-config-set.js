"use strict";

var clc = require("cli-color");

var Command = require("../lib/command");
var getProjectId = require("../lib/getProjectId");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var logger = require("../lib/logger");
var utils = require("../lib/utils");
var functionsConfig = require("../lib/functionsConfig");

module.exports = new Command("functions:config:set [values...]")
  .description("set environment config with key=value syntax")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(functionsConfig.ensureApi)
  .action(function(args, options) {
    if (!args.length) {
      return utils.reject(
        "Must supply at least one key/value pair, e.g. " + clc.bold('app.name="My App"')
      );
    }
    var projectId = getProjectId(options);
    var parsed = functionsConfig.parseSetArgs(args);
    var promises = [];

    parsed.forEach(function(item) {
      promises.push(
        functionsConfig.setVariablesRecursive(projectId, item.configId, item.varId, item.val)
      );
    });

    return Promise.all(promises).then(function() {
      utils.logSuccess("Functions config updated.");
      logger.info(
        "\nPlease deploy your functions for the change to take effect by running " +
          clc.bold("firebase deploy --only functions") +
          "\n"
      );
    });
  });
