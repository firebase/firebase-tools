"use strict";

var _ = require("lodash");

var utils = require("../utils");
var clc = require("cli-color");
var childProcess = require("child_process");
var FirebaseError = require("../error");
var getProjectId = require("../getProjectId");
var logger = require("../logger");
var path = require("path");

function runCommand(command, childOptions) {
  var translatedCommand =
    '"' +
    process.execPath +
    '" "' +
    path.resolve(require.resolve("cross-env"), "..", "bin", "cross-env.js") +
    '" ' +
    command;

  return new Promise(function(resolve, reject) {
    logger.info("Running command: " + command);
    if (translatedCommand === "") {
      resolve();
    }
    var child = childProcess.spawn(translatedCommand, [], childOptions);
    child.on("error", function(err) {
      reject(err);
    });
    child.on("exit", function(code, signal) {
      if (signal) {
        reject(new Error("Command terminated with signal " + signal));
      } else if (code !== 0) {
        reject(new Error("Command terminated with non-zero exit code" + code));
      } else {
        resolve();
      }
    });
  });
}

module.exports = function(target, hook) {
  // Errors in postdeploy script will not exit the process since it's too late to stop the deploy.
  var exit = hook !== "postdeploy" ? undefined : { exit: 2 };

  return function(context, options) {
    var commands = options.config.get(target + "." + hook);

    if (!commands) {
      return Promise.resolve();
    }
    if (typeof commands === "string") {
      commands = [commands];
    }

    // active project ID
    var projectId = getProjectId(options);
    // root directory where firebase.json can be found
    var projectDir = options.projectRoot;
    // location of hosting site or functions deploy, defaults project directory
    var resourceDir;
    switch (target) {
      case "hosting":
        resourceDir = options.config.path(options.config.get("hosting.public"));
        break;
      case "functions":
        resourceDir = options.config.path(options.config.get("functions.source"));
        break;
      default:
        resourceDir = options.config.path(options.config.projectDir);
    }

    // Copying over environment variables
    var childEnv = _.assign({}, process.env, {
      GCLOUD_PROJECT: projectId,
      PROJECT_DIR: projectDir,
      RESOURCE_DIR: resourceDir,
    });

    var childOptions = {
      cwd: options.config.projectDir,
      env: childEnv,
      shell: true,
      stdio: [0, 1, 2], // Inherit STDIN, STDOUT, and STDERR
    };

    var runAllCommands = _.reduce(
      commands,
      function(soFar, command) {
        return soFar.then(function() {
          return runCommand(command, childOptions);
        });
      },
      Promise.resolve()
    );

    return runAllCommands
      .then(function() {
        utils.logSuccess(
          clc.green.bold(target + ":") + " Finished running " + clc.bold(hook) + " script."
        );
      })
      .catch(function(err) {
        throw new FirebaseError(target + " " + hook + " error: " + err.message, exit);
      });
  };
};
