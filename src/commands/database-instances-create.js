"use strict";

var fs = require("fs");

var Command = require("../command");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");
var getProjectNumber = require("../getProjectNumber");
var api = require("../api");

module.exports = new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .before(requirePermissions, [])
  .action(function(options, instanceName) {
    return createDatabaseInstance(instanceName, options).then(function(instance) {
      logger.info(`created database instance ${instance.instance}`);
    });
  });

function createDatabaseInstance(options, instanceName) {
  return getProjectNumber(options)
    .then(function(projectNumber) {
      return api.request("POST", `/v1/projects/${projectNumber}/databases`, {
        auth: true,
        origin: api.firedataOrigin,
        json: {
          instance: instanceName,
        },
      });
    })
    .then(function(response) {
      return response.body.instance;
    });
}
