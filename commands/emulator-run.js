"use strict";

var clc = require("cli-color");

var Command = require("../lib/command");
var logger = require("../lib/logger");
var utils = require("../lib/utils");
var requireAccess = require("../lib/requireAccess");
var requireConfig = require("../lib/requireConfig");
var checkDupHostingKeys = require("../lib/checkDupHostingKeys");
var emulator = require("../lib/emulator/run");
var scopes = require("../lib/scopes");
var filterTargets = require("../lib/filterTargets");
var getProjectNumber = require("../lib/getProjectNumber");

var VALID_TARGETS = ["database", "firestore"];

module.exports = new Command("emulator:run")
  .description("start a local Firebase environment")
  .option(
    "--only <targets>",
    "only serve specified targets (valid targets are: " + VALID_TARGETS.join(",") + ")"
  )
  .option(
    "--except <targets>",
    "serve all except specified targets (valid targets are: " + VALID_TARGETS.join(",") + ")"
  )
  .before(requireConfig)
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(checkDupHostingKeys)
  .before(getProjectNumber)
  .action(function(options) {
    if (options.config) {
      logger.info();
      logger.info(
        clc.bold(clc.white("===") + " Serving from '" + options.config.projectDir + "'...")
      );
      logger.info();
    } else {
      utils.logWarning(
        "No Firebase project directory detected. Serving static content from " +
          clc.bold(options.cwd || process.cwd())
      );
    }
    options.targets = filterTargets(options, VALID_TARGETS);
    return emulator(options);
  });
