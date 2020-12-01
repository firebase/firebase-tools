"use strict";

var { FirebaseError } = require("./error");
var fork = require("child_process").fork;
var path = require("path");

var _ = require("lodash");

var TRIGGER_PARSER = path.resolve(__dirname, "./triggerParser.js");

/**
 * Removes any inspect options (`inspect` or `inspect-brk`) from options so the forked process is able to run (otherwise
 * it'll inherit process values and will use the same port).
 * @param {string[]} options From either `process.execArgv` or `NODE_OPTIONS` envar (which is a space separated string)
 * @return {string[]} `options` without any `inspect` or `inspect-brk` values
 */
function removeInspectOptions(options) {
  return options.filter((opt) => !opt.startsWith("--inspect"));
}

module.exports = function(projectId, sourceDir, configValues, firebaseConfig) {
  return new Promise(function(resolve, reject) {
    var env = _.cloneDeep(process.env);
    env.GCLOUD_PROJECT = projectId;
    if (!_.isEmpty(configValues)) {
      env.CLOUD_RUNTIME_CONFIG = JSON.stringify(configValues);
      if (configValues.firebase) {
        // In case user has `admin.initalizeApp()` at the top of the file and it was executed before firebase-functions v1
        // is loaded, which would normally set FIREBASE_CONFIG.
        env.FIREBASE_CONFIG = JSON.stringify(configValues.firebase);
      }
    }
    if (firebaseConfig) {
      // This value will be populated during functions emulation
      // Make legacy firbase-functions SDK work
      env.FIREBASE_PROJECT = firebaseConfig;
      // In case user has `admin.initalizeApp()` at the top of the file and it was executed before firebase-functions v1
      // is loaded, which would normally set FIREBASE_CONFIG.
      env.FIREBASE_CONFIG = firebaseConfig;
    }

    var execArgv = removeInspectOptions(process.execArgv);
    if (env.NODE_OPTIONS) {
      env.NODE_OPTIONS = removeInspectOptions(env.NODE_OPTIONS.split(" ")).join(" ");
    }

    var parser = fork(TRIGGER_PARSER, [sourceDir], { silent: true, env: env, execArgv: execArgv });

    parser.on("message", function(message) {
      if (message.triggers) {
        resolve(message.triggers);
      } else if (message.error) {
        reject(new FirebaseError(message.error, { exit: 1 }));
      }
    });

    parser.on("exit", function(code) {
      if (code !== 0) {
        reject(
          new FirebaseError(
            "There was an unknown problem while trying to parse function triggers. " +
              "Please ensure you are using Node.js v6 or greater.",
            { exit: 2 }
          )
        );
      }
    });
  });
};
