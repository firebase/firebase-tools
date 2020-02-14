"use strict";

var clc = require("cli-color");

var { Command } = require("../command");
var requireConfig = require("../requireConfig");
var utils = require("../utils");

module.exports = new Command("target:remove <type> <resource>")
  .description("remove a resource target")
  .before(requireConfig)
  .action(function(type, resource, options) {
    var name = options.rc.removeTarget(options.project, type, resource);
    if (name) {
      utils.logSuccess(
        "Removed " + type + " target " + clc.bold(name) + " from " + clc.bold(resource)
      );
    } else {
      utils.logWarning(
        "No action taken. No target found for " + type + " resource " + clc.bold(resource)
      );
    }
    return Promise.resolve(name);
  });
