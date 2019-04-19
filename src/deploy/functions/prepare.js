"use strict";

var _ = require("lodash");
var cjson = require("cjson");
var clc = require("cli-color");
var path = require("path");

var ensureApiEnabled = require("../../ensureApiEnabled");
var functionsConfig = require("../../functionsConfig");
var fsutils = require("../../fsutils");
var getProjectId = require("../../getProjectId");
var logger = require("../../logger");
var resolveProjectPath = require("../../resolveProjectPath");
var utils = require("../../utils");

// Check that functions directory exists
var _checkFunctionsDirectoryExists = function(cwd, sourceDirName) {
  if (!fsutils.dirExistsSync(resolveProjectPath(cwd, sourceDirName))) {
    var msg =
      `could not deploy functions because the ${clc.bold('"' + sourceDirName + '"')} ` +
      `directory was not found. Please create it or specify a different source directory in firebase.json`;
    return utils.reject(msg, { exit: 1 });
  }
};

// Validate function names only contain lower case letters, numbers, and dashes
var _validateFunctionName = function(functionNames) {
  var validFunctionNameRegex = /^[a-z][a-zA-Z0-9_-]{1,62}$/i;
  var invalidNames = _.reject(_.keys(functionNames), function(name) {
    return _.startsWith(name, ".") || validFunctionNameRegex.test(name);
  });
  if (!_.isEmpty(invalidNames)) {
    var msg = `${invalidNames.join(
      ", "
    )} function name(s) must be a valid subdomain (lowercase letters, numbers and dashes)`;
    return utils.reject(msg, { exit: 1 });
  }
};

// Validate contents of package.json - main file present and engines specified
var _validatePackageJsonFile = function(sourceDirName, sourceDir, projectDir) {
  var packageJsonFile = path.join(sourceDir, "package.json");
  if (fsutils.fileExistsSync(packageJsonFile)) {
    try {
      var data = cjson.load(packageJsonFile);
      logger.debug("> [functions] package.json contents:", JSON.stringify(data, null, 2));
      var indexJsFile = path.join(sourceDir, data.main || "index.js");
      if (!fsutils.fileExistsSync(indexJsFile)) {
        var msg = `${path.relative(
          projectDir,
          indexJsFile
        )} does not exist, can't deploy Firebase Functions`;
        return utils.reject(msg, { exit: 1 });
      }
    } catch (e) {
      var msg = `There was an error reading ${sourceDirName}${path.sep}package.json:\n\n ${
        e.message
      }`;
      return utils.reject(msg, { exit: 1 });
    }
  } else if (!fsutils.fileExistsSync(path.join(sourceDir, "function.js"))) {
    var msg = `No npm package found in functions source directory. Please run 'npm init' inside ${sourceDirName}`;
    return utils.reject(msg, { exit: 1 });
  }
};

module.exports = function(context, options, payload) {
  if (!options.config.has("functions")) {
    return Promise.resolve();
  }

  var sourceDirName = options.config.get("functions.source");
  var sourceDir = options.config.path(sourceDirName);
  var projectDir = options.config.projectDir;
  var functionNames = payload.functions;
  var projectId = getProjectId(options);

  var invalidOptions =
    _checkFunctionsDirectoryExists(options.cwd, sourceDirName) ||
    _validateFunctionName(functionNames) ||
    _validatePackageJsonFile(sourceDirName, sourceDir, projectDir);

  if (invalidOptions) {
    return invalidOptions;
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
