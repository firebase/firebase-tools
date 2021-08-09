"use strict";

const _ = require("lodash");

const utils = require("../utils");
const clc = require("cli-color");
const childProcess = require("child_process");
const { FirebaseError } = require("../error");
const needProjectId = require("../projectUtils").needProjectId;
const { logger } = require("../logger");
const path = require("path");

function runCommand(command, childOptions) {
  const escapedCommand = command.replace(/\"/g, '\\"');
  const translatedCommand =
    '"' +
    process.execPath +
    '" "' +
    path.resolve(require.resolve("cross-env"), "..", "bin", "cross-env-shell.js") +
    '" "' +
    escapedCommand +
    '"';

  return new Promise(function (resolve, reject) {
    logger.info("Running command: " + command);
    if (translatedCommand === "") {
      resolve();
    }
    const child = childProcess.spawn(translatedCommand, [], childOptions);
    child.on("error", function (err) {
      reject(err);
    });
    child.on("exit", function (code, signal) {
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
  const projectId = needProjectId(overallOptions);
  // root directory where firebase.json can be found
  const projectDir = overallOptions.projectRoot;
  // location of hosting site or functions deploy, defaults project directory
  let resourceDir;
  switch (target) {
    case "hosting":
      resourceDir = overallOptions.config.path(config.public);
      break;
    case "functions":
      resourceDir = overallOptions.config.path(config.source);
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

  const childOptions = {
    cwd: overallOptions.config.projectDir,
    env: getChildEnvironment(target, overallOptions, config),
    shell: true,
    stdio: [0, 1, 2], // Inherit STDIN, STDOUT, and STDERR
  };

  const runAllCommands = _.reduce(
    commands,
    function (soFar, command) {
      return soFar.then(function () {
        return runCommand(command, childOptions);
      });
    },
    Promise.resolve()
  );

  // We currently use the resource name in info logs in the rest of the deploy.
  // However we don't have access to that here because predeploy hooks will
  // happen before we figure that out.  Internal bug tracking number: 123715324
  let logIdentifier = target;
  if (config.target) {
    logIdentifier += `[${config.target}]`;
  }

  return runAllCommands
    .then(function () {
      utils.logSuccess(
        clc.green.bold(logIdentifier + ":") + " Finished running " + clc.bold(hook) + " script."
      );
    })
    .catch(function (err) {
      throw new FirebaseError(logIdentifier + " " + hook + " error: " + err.message);
    });
}

function getReleventConfigs(target, options) {
  let targetConfigs = options.config.get(target);
  if (!targetConfigs) {
    return [];
  }
  if (!_.isArray(targetConfigs)) {
    targetConfigs = [targetConfigs];
  }

  if (!options.only) {
    return targetConfigs;
  }

  var onlyTargets = options.only.split(",");
  if (_.includes(onlyTargets, target)) {
    // If the target matches entirely then all instances should be included.
    return targetConfigs;
  }

  onlyTargets = onlyTargets
    .filter(function (individualOnly) {
      return individualOnly.indexOf(`${target}:`) === 0;
    })
    .map(function (individualOnly) {
      return individualOnly.replace(`${target}:`, "");
    });

  return targetConfigs.filter(function (config) {
    return !config.target || _.includes(onlyTargets, config.target);
  });
}

module.exports = function (target, hook) {
  return function (context, options) {
    return _.reduce(
      getReleventConfigs(target, options),
      function (previousCommands, individualConfig) {
        return previousCommands.then(function () {
          return runTargetCommands(target, hook, options, individualConfig);
        });
      },
      Promise.resolve()
    );
  };
};
