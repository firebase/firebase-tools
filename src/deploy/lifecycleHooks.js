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
  var escapedCommand = command.replace(/\"/g, '\\"');
  var translatedCommand =
    '"' +
    process.execPath +
    '" "' +
    path.resolve(require.resolve("cross-env"), "..", "bin", "cross-env-shell.js") +
    '" "' +
    escapedCommand +
    '"';

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

function getChildEnvironment(target, overallOptions, config) {
  // active project ID
  var projectId = getProjectId(overallOptions);
  // root directory where firebase.json can be found
  var projectDir = overallOptions.projectRoot;
  // location of hosting site or functions deploy, defaults project directory
  var resourceDir;
  switch (target) {
    case "hosting":
      resourceDir = overallOptions.config.path(config["public"]);
      break;
    case "functions":
      resourceDir = overallOptions.config.path(config["source"]);
      break;
    default:
      resourceDir = overallOptions.config.path(overallOptions.config.projectDir);
  }

  // Copying over environment variables
  return _.assign({}, process.env, {
    GCLOUD_PROJECT: projectId,
    PROJECT_DIR: projectDir,
    RESOURCE_DIR: resourceDir,
  });
}

function runTargetCommands(target, hook, overallOptions, config) {
  let commands = config[hook];
  if (!commands) {
    return Promise.resolve();
  }
  if (typeof commands === "string") {
    commands = [commands];
  }

  var childOptions = {
    cwd: overallOptions.config.projectDir,
    env: getChildEnvironment(target, overallOptions, config),
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

  // Errors in postdeploy script will not exit the process since it's too late to stop the deploy.
  const exit = hook !== "postdeploy" ? undefined : { exit: 2 };

  // We currently use the resource name in info logs in the rest of the deploy.
  // However we don't have access to that here because predeploy hooks will
  // happen before we figure that out.  Internal bug tracking number: 123715324
  let logIdentifier = target;
  if (config.target) {
    logIdentifier += `[${config.target}]`;
  }

  return runAllCommands
    .then(function() {
      utils.logSuccess(
        clc.green.bold(logIdentifier + ":") + " Finished running " + clc.bold(hook) + " script."
      );
    })
    .catch(function(err) {
      throw new FirebaseError(logIdentifier + " " + hook + " error: " + err.message, exit);
    });
}

module.exports = function(target, hook) {
  return function(context, options) {
    let targetConfigs = options.config.get(target);
    if (!targetConfigs) {
      return Promise.resolve();
    }
    if (!_.isArray(targetConfigs)) {
      targetConfigs = [targetConfigs];
    }

    return _.reduce(
      targetConfigs,
      function(previousCommands, individualConfig) {
        return previousCommands.then(function() {
          return runTargetCommands(target, hook, options, individualConfig);
        });
      },
      Promise.resolve()
    );
  };
};
