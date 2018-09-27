"use strict";

var _ = require("lodash");
var Command = require("../lib/command");
var getProjectId = require("../lib/getProjectId");
var logger = require("../lib/logger");
var requirePermissions = require("../lib/requirePermissions");
var functionsConfig = require("../lib/functionsConfig");

function _materialize(projectId, path) {
  if (_.isUndefined(path)) {
    return functionsConfig.materializeAll(projectId);
  }
  var parts = path.split(".");
  var configId = parts[0];
  var configName = _.join(["projects", projectId, "configs", configId], "/");
  return functionsConfig.materializeConfig(configName, {}).then(function(result) {
    var query = _.chain(parts)
      .join(".")
      .value();
    return query ? _.get(result, query) : result;
  });
}

module.exports = new Command("functions:config:get [path]")
  .description("fetch environment config stored at the given path")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(functionsConfig.ensureApi)
  .action(function(path, options) {
    return _materialize(getProjectId(options), path).then(function(result) {
      logger.info(JSON.stringify(result, null, 2));
      return result;
    });
  });
