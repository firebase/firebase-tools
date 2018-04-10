"use strict";

var _ = require("lodash");
var chalk = require("chalk");

var Command = require("../lib/command");
var logger = require("../lib/logger");
var requireConfig = require("../lib/requireConfig");
var utils = require("../lib/utils");

function _logTargets(type, targets) {
  logger.info(chalk.cyan("[ " + type + " ]"));
  _.forEach(targets, function(resources, name) {
    logger.info(name, "(" + (resources || []).join(",") + ")");
  });
}

module.exports = new Command("target [type]")
  .description("display configured deploy targets for the current project")
  .before(requireConfig)
  .action(function(type, options) {
    if (!options.project) {
      return utils.error("No active project, cannot list deploy targets.");
    }

    logger.info("Resource targets for", chalk.bold(options.project) + ":");
    logger.info();
    if (type) {
      var targets = options.rc.targets(options.project, type);
      _logTargets(type, targets);
      return Promise.resolve(targets);
    }

    var allTargets = options.rc.get(["targets", options.project], {});
    _.forEach(allTargets, function(ts, tp) {
      _logTargets(tp, ts);
    });
    return Promise.resolve(allTargets);
  });
