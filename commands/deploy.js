"use strict";

var _ = require("lodash");

var requireInstance = require("../lib/requireInstance");
var requirePermissions = require("../lib/requirePermissions");
var checkDupHostingKeys = require("../lib/checkDupHostingKeys");
var checkValidTargetFilters = require("../lib/checkValidTargetFilters");
var checkFirebaseSDKVersion = require("../lib/checkFirebaseSDKVersion");
var Command = require("../lib/command");
var deploy = require("../lib/deploy");
var requireConfig = require("../lib/requireConfig");
var filterTargets = require("../lib/filterTargets");

// in order of least time-consuming to most time-consuming
var VALID_TARGETS = ["database", "storage", "firestore", "functions", "hosting"];
var TARGET_PERMISSIONS = {
  database: ["firebasedatabase.instances.update"],
  hosting: ["firebasehosting.sites.update"],
  functions: [
    "cloudfunctions.functions.list",
    "cloudfunctions.functions.create",
    "cloudfunctions.functions.get",
    "cloudfunctions.functions.update",
    "cloudfunctions.functions.delete",
    "cloudfunctions.operations.get",
  ],
  firestore: [
    "datastore.indexes.list",
    "datastore.indexes.create",
    "datastore.indexes.update",
    "datastore.indexes.delete",
  ],
  storage: [
    "firebaserules.releases.create",
    "firebaserules.rulesets.create",
    "firebaserules.releases.update",
  ],
};

module.exports = new Command("deploy")
  .description("deploy code and assets to your Firebase project")
  .option("-p, --public <path>", "override the Hosting public directory specified in firebase.json")
  .option("-m, --message <message>", "an optional message describing this deploy")
  .option(
    "-f, --force",
    "delete Cloud Functions missing from the current working directory without confirmation"
  )
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
    options.filteredTargets = filterTargets(options, VALID_TARGETS);
    const permissions = options.filteredTargets.reduce((perms, target) => {
      return perms.concat(TARGET_PERMISSIONS[target]);
    }, []);
    return requirePermissions(options, permissions);
  })
  .before(function(options) {
    // only fetch the default instance for hosting or database deploys
    if (_.intersection(options.filteredTargets, ["hosting", "database"]).length > 0) {
      return requireInstance(options);
    }
  })
  .before(checkDupHostingKeys)
  .before(checkValidTargetFilters)
  .before(checkFirebaseSDKVersion)
  .action(function(options) {
    return deploy(options.filteredTargets, options);
  });
