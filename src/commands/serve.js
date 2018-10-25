"use strict";

var clc = require("cli-color");

var Command = require("../command");
var logger = require("../logger");
var utils = require("../utils");
var requirePermissions = require("../requirePermissions");
var requireConfig = require("../requireConfig");
var checkDupHostingKeys = require("../checkDupHostingKeys");
var serve = require("../serve/index");
var filterTargets = require("../filterTargets");
var getProjectNumber = require("../getProjectNumber");
var previews = require("../previews");

var VALID_TARGETS = ["functions", "hosting"];

if (previews.emulators) {
  VALID_TARGETS = ["functions", "hosting", "database", "firestore"];
}

module.exports = new Command("serve")
  .description("start a local server for your static assets")
  .option("-p, --port <port>", "the port on which to listen (default: 5000)", 5000)
  .option("-o, --host <host>", "the host on which to listen (default: localhost)", "localhost")
  .option(
    "--only <targets>",
    "only serve specified targets (valid targets are: " + VALID_TARGETS.join(", ") + ")"
  )
  .option(
    "--except <targets>",
    "serve all except specified targets (valid targets are: " + VALID_TARGETS.join(", ") + ")"
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
