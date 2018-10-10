"use strict";

var clc = require("cli-color");

var Command = require("../lib/command");
var logger = require("../lib/logger");
var utils = require("../lib/utils");
var requirePermissions = require("../lib/requirePermissions");
var requireConfig = require("../lib/requireConfig");
var checkDupHostingKeys = require("../lib/checkDupHostingKeys");
var serve = require("../lib/serve/index");
var filterTargets = require("../lib/filterTargets");
var getProjectNumber = require("../lib/getProjectNumber");

var VALID_TARGETS = ["functions", "hosting"];

module.exports = new Command("serve")
  .description("start a local server for your static assets")
  .option("-p, --port <port>", "the port on which to listen (default: 5000)", 5000)
  .option("-o, --host <host>", "the host on which to listen (default: localhost)", "localhost")
  .option(
    "--only <targets>",
    "only serve specified targets (valid targets are: functions, hosting)"
  )
  .option(
    "--except <targets>",
    "serve all except specified targets (valid targets are: functions, hosting)"
  )
  .before(requireConfig)
  .before(requirePermissions)
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
    return serve(options);
  });
