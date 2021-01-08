"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var { Command } = require("../command");
var logger = require("../logger");
var requireConfig = require("../requireConfig");
var utils = require("../utils");

function _logTargets(type, targets) {
  logger.info(clc.cyan("[ " + type + " ]"));
  _.forEach(targets, function (resources, name) {
    logger.info(name, "(" + (resources || []).join(",") + ")");
  });
}

module.exports = new Command("target [type]")
  .description("display configured deploy targets for the current project")
  .before(requireConfig)
  .action(function (type, options) {
    if (!options.project) {
      return utils.reject("No active project, cannot list deploy targets.");
    }

    logger.info("Resource targets for", clc.bold(options.project) + ":");
    logger.info();
    if (type) {
      var targets = options.rc.targets(options.project, type);
      _logTargets(type, targets);
      return Promise.resolve(targets);
    }

    var allTargets = options.rc.get(["targets", options.project], {});
    _.forEach(allTargets, function (ts, tp) {
      _logTargets(tp, ts);
    });
    return Promise.resolve(allTargets);
  });
