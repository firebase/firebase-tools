"use strict";

var _ = require("lodash");

var Command = require("../lib/command");
var getProjectId = require("../lib/getProjectId");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var runtimeconfig = require("../lib/gcp/runtimeconfig");
var functionsConfig = require("../lib/functionsConfig");
var logger = require("../lib/logger");

module.exports = new Command("functions:config:legacy")
  .description("get legacy functions config variables")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    var projectId = getProjectId(options);
    var metaPath = "projects/" + projectId + "/configs/firebase/variables/meta";
    return runtimeconfig.variables
      .get(metaPath)
      .then(function(result) {
        var metaVal = JSON.parse(result.text);
        if (!_.has(metaVal, "version")) {
          logger.info("You do not have any legacy config variables.");
          return null;
        }
        var latestVarPath = functionsConfig.idsToVarName(projectId, "firebase", metaVal.version);
        return runtimeconfig.variables.get(latestVarPath);
      })
      .then(function(latest) {
        if (latest !== null) {
          var latestVal = JSON.parse(latest.text);
          logger.info(JSON.stringify(latestVal, null, 2));
          return latestVal;
        }
      })
      .catch(function(err) {
        if (_.get(err, "context.response.statusCode") === 404) {
          logger.info("You do not have any legacy config variables.");
          return null;
        }
        return Promise.reject(err);
      });
  });
