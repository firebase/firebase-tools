"use strict";

var _ = require("lodash");

var ensureApiEnabled = require("../../ensureApiEnabled");
var functionsConfig = require("../../functionsConfig");
var getProjectId = require("../../getProjectId");
var validator = require("./validate");

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  var sourceDirName = options.config.get("functions.source");
  var sourceDir = options.config.path(sourceDirName);
  var projectDir = options.config.projectDir;
  var functionNames = payload.functions;
  var projectId = getProjectId(options);

  try {
    validator.functionsDirectoryExists(options.cwd, sourceDirName);
    validator.functionNamesAreValid(functionNames);
    // it's annoying that we have to pass in both sourceDirName and sourceDir
    // but they are two different methods on the config object, so cannot get
    // sourceDir from sourceDirName without passing in config
    validator.packageJsonIsValid(sourceDirName, sourceDir, projectDir);
  } catch (e) {
    return Promise.reject(e);
  }

  return Promise.all([
    ensureApiEnabled.ensure(options.project, "cloudfunctions.googleapis.com", "functions"),
    ensureApiEnabled.check(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true),
  ])
    .then(function(results) {
      _.set(context, "runtimeConfigEnabled", results[1]);
      return functionsConfig.getFirebaseConfig(options);
    })
    .then(function(result) {
      _.set(context, "firebaseConfig", result);
    });
};
