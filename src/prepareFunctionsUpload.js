"use strict";

var _ = require("lodash");
var archiver = require("archiver");
var clc = require("cli-color");
var filesize = require("filesize");
var fs = require("fs");
var path = require("path");
var semver = require("semver");
var tmp = require("tmp");

var FirebaseError = require("./error");
var functionsConfig = require("./functionsConfig");
var getProjectId = require("./getProjectId");
var logger = require("./logger");
var utils = require("./utils");
var parseTriggers = require("./parseTriggers");
var fsAsync = require("./fsAsync");

var CONFIG_DEST_FILE = ".runtimeconfig.json";

var _getFunctionsConfig = function(context) {
  var next = Promise.resolve({});
  if (context.runtimeConfigEnabled) {
    next = functionsConfig.materializeAll(context.firebaseConfig.projectId).catch(function(err) {
      logger.debug(err);
      var errorCode = _.get(err, "context.response.statusCode");
      if (errorCode === 500 || errorCode === 503) {
        throw new FirebaseError(
          "Cloud Runtime Config is currently experiencing issues, " +
            "which is preventing your functions from being deployed. " +
            "Please wait a few minutes and then try to deploy your functions again." +
            "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project."
        );
      }
    });
  }

  return next.then(function(config) {
    var firebaseConfig = _.get(context, "firebaseConfig");
    _.set(config, "firebase", firebaseConfig);
    return config;
  });
};

var _pipeAsync = function(from, to) {
  return new Promise(function(resolve, reject) {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
};

var _packageSource = function(options, sourceDir, configValues) {
  var tmpFile = tmp.fileSync({ prefix: "firebase-functions-", postfix: ".zip" }).name;
  var fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    defaultEncoding: "binary",
  });
  var archive = archiver("zip");
  var archiveDone = _pipeAsync(archive, fileStream);

  // We must ignore firebase-debug.log or weird things happen if
  // you're in the public dir when you deploy.
  // We ignore any CONFIG_DEST_FILE that already exists, and write another one
  // with current config values into the archive in the "end" handler for reader
  var ignore = options.config.get("functions.ignore", ["node_modules"]);
  ignore.push("firebase-debug.log", CONFIG_DEST_FILE /* .runtimeconfig.json */);
  return fsAsync
    .readdirRecursive({ path: sourceDir, ignore: ignore })
    .then(function(files) {
      _.forEach(files, function(file) {
        archive.file(file.name, {
          name: path.relative(sourceDir, file.name),
          mode: file.mode,
        });
      });
      archive.append(JSON.stringify(configValues, null, 2), {
        name: CONFIG_DEST_FILE,
        mode: 420 /* 0o644 */,
      });
      archive.finalize();
      return archiveDone;
    })
    .then(
      function() {
        utils.logBullet(
          clc.cyan.bold("functions:") +
            " packaged " +
            clc.bold(options.config.get("functions.source")) +
            " (" +
            filesize(archive.pointer()) +
            ") for uploading"
        );
        return {
          file: tmpFile,
          stream: fs.createReadStream(tmpFile),
          size: archive.pointer(),
        };
      },
      function(err) {
        throw new FirebaseError(
          "Could not read source directory. Remove links and shortcuts and try again.",
          {
            original: err,
            exit: 1,
          }
        );
      }
    );
};

var _getRuntimeChoice = function(sourceDir) {
  var packageJsonPath = path.join(sourceDir, "package.json");
  var loaded = require(packageJsonPath);
  var choice = loaded.engines;
  if (!choice) {
    return null;
  }
  if (_.isEqual(choice, { node: "6" })) {
    return "nodejs6";
  }
  if (_.isEqual(choice, { node: "8" })) {
    var SDKRange = _.get(loaded, "dependencies.firebase-functions");
    try {
      if (!semver.intersects(SDKRange, ">=2")) {
        throw new FirebaseError(
          "You must have a firebase-functions version that is at least 1.1.0 " +
            "in order to deploy functions to the Node 8 runtime.\nPlease run " +
            clc.bold("npm i --save firebase-functions@latest") +
            " in the functions folder.",
          {
            exit: 1,
          }
        );
      }
    } catch (e) {
      // semver check will fail if a URL is used instead of a version number, do nothing
    }
    return "nodejs8";
  }
  throw new FirebaseError(
    clc.bold("package.json") +
      " in functions directory has an engines field which is unsupported." +
      " The only valid choices are: " +
      clc.bold('{"node": "8"}') +
      " and " +
      clc.bold('{"node": "6"}') +
      ".",
    {
      exit: 1,
    }
  );
};

module.exports = function(context, options) {
  var configValues;
  var sourceDir = options.config.path(options.config.get("functions.source"));
  context.runtimeChoice = _getRuntimeChoice(sourceDir);
  return _getFunctionsConfig(context)
    .then(function(result) {
      configValues = result;
      return parseTriggers(getProjectId(options), sourceDir, configValues);
    })
    .then(function(triggers) {
      options.config.set("functions.triggers", triggers);
      if (options.config.get("functions.triggers").length === 0) {
        return Promise.resolve(null);
      }
      return _packageSource(options, sourceDir, configValues);
    });
};
