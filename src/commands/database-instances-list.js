"use strict";

var fs = require("fs");

var Command = require("../command");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");
var getProjectNumber = require("../getProjectNumber");
var api = require("../api");

module.exports = new Command("database:instances:list")
  .description("list realtime database instances")
  .before(requirePermissions, [])
  .action(function(options) {
    return getDatabaseInstances(options).then(function(instances) {
      for (const instance of instances) {
        console.log(instance);
      }
      return null;
    });
  });

function getDatabaseInstances(options) {
  return getProjectNumber(options)
    .then(function(projectNumber) {
      return api.request("GET", `/v1/projects/${projectNumber}/databases`, {
        auth: true,
        origin: api.firedataOrigin,
      });
    })
    .then(function(response) {
      return response.body.instance.map((info) => info.instance);
    });
}
