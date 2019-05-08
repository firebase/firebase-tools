"use strict";

var Command = require("../command");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");
var getProjectNumber = require("../getProjectNumber");
var firedata = require("../gcp/firedata");

module.exports = new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .before(requirePermissions, [])
  .action(function(instanceName, options) {
    return getProjectNumber(options).then(function(projectNumber) {
      return firedata.createDatabaseInstance(projectNumber, instanceName).then(function(instance) {
        logger.info(`created database instance ${instance.instance}`);
      });
    });
  });
