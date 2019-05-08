"use strict";

var Command = require("../command");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");
var getProjectNumber = require("../getProjectNumber");
var firedata = require("../gcp/firedata");

module.exports = new Command("database:instances:list")
  .description("list realtime database instances")
  .before(requirePermissions, [])
  .action(function(options) {
    return getProjectNumber(options).then(function(projectNumber) {
      return firedata.listDatabaseInstances(projectNumber).then(function(instances) {
        for (const instance of instances) {
          logger.info(instance.instance);
        }
      });
    });
  });
