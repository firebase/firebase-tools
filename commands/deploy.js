"use strict";

var acquireRefs = require("../lib/acquireRefs");
var chalk = require("chalk");
var checkDupHostingKeys = require("../lib/checkDupHostingKeys");
var checkValidTargetFilters = require("../lib/checkValidTargetFilters");
var checkFirebaseSDKVersion = require("../lib/checkFirebaseSDKVersion");
var Command = require("../lib/command");
var deploy = require("../lib/deploy");
var logger = require("../lib/logger");
var requireConfig = require("../lib/requireConfig");
var scopes = require("../lib/scopes");
var utils = require("../lib/utils");
var filterTargets = require("../lib/filterTargets");

// in order of least time-consuming to most time-consuming
var VALID_TARGETS = ["database", "storage", "firestore", "functions", "hosting"];

module.exports = new Command("deploy")
  .description("deploy code and assets to your Firebase project")
  .option("-p, --public <path>", "override the Hosting public directory specified in firebase.json")
  .option("-m, --message <message>", "an optional message describing this deploy")
  .option(
    "--only <targets>",
    'only deploy to specified, comma-separated targets (e.g. "hosting,storage"). For functions, ' +
      'can specify filters with colons to scope function deploys to only those functions (e.g. "--only functions:func1,functions:func2"). ' +
      "When filtering based on export groups (the exported module object keys), use dots to specify group names " +
      '(e.g. "--only functions:group1.subgroup1,functions:group2)"'
  )
  .option("--except <targets>", 'deploy to all targets except specified (e.g. "database")')
  .before(requireConfig)
  .before(function(options) {
    return acquireRefs(options, [scopes.CLOUD_PLATFORM]).catch(function(err) {
      if (options.config.has("functions")) {
        throw err;
      }

      logger.info();
      utils.logWarning(
        chalk.bold("Your CLI authentication needs to be updated to take advantage of new features.")
      );
      utils.logWarning(chalk.bold("Please run " + chalk.underline("firebase login --reauth")));
      logger.info();

      return acquireRefs(options, []);
    });
  })
  .before(checkDupHostingKeys)
  .before(checkValidTargetFilters)
  .before(checkFirebaseSDKVersion)
  .action(function(options) {
    var targets = filterTargets(options, VALID_TARGETS);
    return deploy(targets, options);
  });
