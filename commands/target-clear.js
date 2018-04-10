"use strict";

var chalk = require("chalk");

var Command = require("../lib/command");
var requireConfig = require("../lib/requireConfig");
var utils = require("../lib/utils");

module.exports = new Command("target:clear <type> <target>")
  .description("clear all resources from a named resource target")
  .before(requireConfig)
  .action(function(type, name, options) {
    var existed = options.rc.clearTarget(options.project, type, name);
    if (existed) {
      utils.logSuccess("Cleared " + type + " target " + chalk.bold(name));
    } else {
      utils.logWarning("No action taken. No " + type + " target found named " + chalk.bold(name));
    }
    return Promise.resolve(existed);
  });
