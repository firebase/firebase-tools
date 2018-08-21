"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var Command = require("../lib/command");
var logger = require("../lib/logger");
var requireConfig = require("../lib/requireConfig");
var utils = require("../lib/utils");

module.exports = new Command("target:apply <type> <name> <resources...>")
  .description("apply a deploy target to a resource")
  .before(requireConfig)
  .action(function(type, name, resources, options) {
    if (!options.project) {
      return utils.reject(
        "Must have an active project to set deploy targets. Try " + clc.bold("firebase use --add")
      );
    }

    var changes = options.rc.applyTarget(options.project, type, name, resources);

    utils.logSuccess(
      "Applied " + type + " target " + clc.bold(name) + " to " + clc.bold(resources.join(", "))
    );
    _.forEach(changes, function(change) {
      utils.logWarning(
        "Previous target " + clc.bold(change.target) + " removed from " + clc.bold(change.resource)
      );
    });
    logger.info();
    logger.info(
      "Updated: " + name + " (" + options.rc.target(options.project, type, name).join(",") + ")"
    );
  });
