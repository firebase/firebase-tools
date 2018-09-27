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
var getProjectNumber = require("../lib/getProjectNumber");

module.exports = new Command("experimental:database:emulate")
  .description("start a local database emulator")
  .option(
    "-y",
    "--yes",
    "Automatic yes to prompts; assume `yes` as answer to all prompts and run non-interactively. If an undesirable situation, such as insufficient permissions then abort. (default: false)",
    true
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
    options.targets = ["database"];
    return emulator(options);
  });
