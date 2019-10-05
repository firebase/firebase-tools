"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var logger = require("../logger");
var features = require("./features");
var utils = require("../utils");
var requirePermissions = require("../requirePermissions");

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

var init = function(setup, config, options) {
  var nextFeature = setup.features.shift();
  if (nextFeature) {
    if (!features[nextFeature]) {
      return utils.reject(
        clc.bold(nextFeature) +
          " is not a valid feature. Must be one of " +
          _.without(_.keys(features), "project").join(", ")
      );
    }

    // check permissions if the initialization is on an existing project
    var checkPermissions = Promise.resolve();
    if (setup.projectId) {
      var projectOptions = { project: setup.projectId };
      checkPermissions = requirePermissions(projectOptions, TARGET_PERMISSIONS[nextFeature]);
    }

    logger.info(clc.bold("\n" + clc.white("=== ") + _.capitalize(nextFeature) + " Setup"));

    return checkPermissions
      .then(() => features[nextFeature](setup, config, options))
      .then(() => init(setup, config, options))
      .catch((err) => utils.reject(err.message));
  }
  return Promise.resolve();
};

module.exports = init;
