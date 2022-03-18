"use strict";

var clc = require("cli-color");
var _ = require("lodash");

var { Command } = require("../command");
const { logger } = require("../logger");
var utils = require("../utils");
var { requirePermissions } = require("../requirePermissions");
var { requireConfig } = require("../requireConfig");
var { serve } = require("../serve/index");
var { filterTargets } = require("../filterTargets");
var { needProjectNumber } = require("../projectUtils");
var { FirebaseError } = require("../error");

var VALID_TARGETS = ["hosting", "functions"];
var REQUIRES_AUTH = ["hosting", "functions"];
var ALL_TARGETS = _.union(VALID_TARGETS, ["database", "firestore"]);

var filterOnly = (list, only) => {
  if (!only) {
    return [];
  }
  return _.intersection(
    list,
    only.split(",").map((opt) => {
      return opt.split(":")[0];
    })
  );
};

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
  .before((options) => {
    if (
      options.only &&
      options.only.length > 0 &&
      filterOnly(REQUIRES_AUTH, options.only).length === 0
    ) {
      return Promise.resolve();
    }
    return requireConfig(options)
      .then(() => requirePermissions(options))
      .then(() => needProjectNumber(options));
  })
  .action((options) => {
    options.targets = filterOnly(ALL_TARGETS, options.only);
    if (options.targets.includes("database") || options.targets.includes("firestore")) {
      throw new FirebaseError(
        `Please use ${clc.bold(
          "firebase emulators:start"
        )} to start the Realtime Database or Cloud Firestore emulators. ${clc.bold(
          "firebase serve"
        )} only supports Hosting and Cloud Functions.`
      );
    }

    options.targets = filterOnly(VALID_TARGETS, options.only);
    if (options.targets.length > 0) {
      return serve(options);
    }
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
