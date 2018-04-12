"use strict";

var _ = require("lodash");
var chalk = require("chalk");
var path = require("path");

var getProjectId = require("./getProjectId");
var utils = require("./utils");
var parseTriggers = require("./parseTriggers");
var functionsConfig = require("./functionsConfig");
var ensureDefaultCredentials = require("./ensureDefaultCredentials");
var track = require("./track");
var logger = require("./logger");

var EmulatorController;

var FunctionsEmulator = function(options) {
  this.controller = null;
  this.emulatedFunctions = [];
  this.options = options;
  this.triggers = [];
  this.urls = {};
};

var _pollOperation = function(op, controller) {
  return new Promise(function(resolve, reject) {
    var poll = function() {
      controller.client
        .getOperation(op[0].name)
        .then(function(results) {
          var operation = results[0];
          if (operation.done) {
            if (operation.response) {
              resolve(operation.response.value);
            } else {
              reject(operation.error || new Error("Deployment failed"));
            }
          } else {
            setTimeout(poll, 500);
          }
        })
        .catch(reject);
    };
    poll();
  });
};

FunctionsEmulator.prototype.stop = function() {
  delete process.env.FIREBASE_CONFIG;
  delete process.env.FIREBASE_PROJECT;
  delete process.env.GCLOUD_PROJECT;
  var controller = this.controller;
  return new Promise(function(resolve) {
    if (controller) {
      controller.stop().then(resolve);
      // Force-kill controller after 0.5 s
      setInterval(function() {
        controller.kill().then(resolve);
      }, 500);
    } else {
      resolve();
    }
  });
};

FunctionsEmulator.prototype._getPorts = function() {
  var portsConfig = {
    supervisorPort: this.options.port,
    restPort: this.options.port + 1,
  };
  if (_.includes(this.options.targets, "hosting")) {
    return _.mapValues(portsConfig, function(port) {
      return port + 1; // bump up port numbers by 1 so hosting can be served on first port
    });
  }
  return portsConfig;
};

FunctionsEmulator.prototype._getConfigOptions = function() {
  var ports = this._getPorts();
  return _.merge(ports, {
    maxIdle: 540000,
    tail: true,
  });
};

FunctionsEmulator.prototype.start = function(shellMode) {
  shellMode = shellMode || false;
  var options = this.options;
  var projectId = getProjectId(options);
  var emulatedFunctions = this.emulatedFunctions;
  var instance = this;
  var functionsDir = path.join(options.config.projectDir, options.config.get("functions.source"));
  var controllerConfig = this._getConfigOptions();
  var firebaseConfig;
  var emulatedProviders = {};

  try {
    // Require must be inside try/catch, since it's an optional dependency. As well, require may fail if node version incompatible.
    var emulatorConfig = require("@google-cloud/functions-emulator/src/config");
    // Must set projectId here instead of later when initializing the controller,
    // otherwise emulator may crash since it is looking for a config file in /src/options.js
    emulatorConfig.set("projectId", projectId); // creates config file in a directory known to the emulator
    EmulatorController = require("@google-cloud/functions-emulator/src/cli/controller");
  } catch (err) {
    var msg = err;
    utils.logWarning(chalk.yellow("functions:") + " Cannot start emulator. " + msg);
    return Promise.reject();
  }

  this.controller = new EmulatorController(controllerConfig);
  var controller = this.controller;

  utils.logBullet(chalk.cyan.bold("functions:") + " Preparing to emulate functions.");
  logger.debug("Fetching environment");
  ensureDefaultCredentials();
  return functionsConfig
    .getFirebaseConfig(options)
    .then(function(result) {
      firebaseConfig = JSON.stringify(result);
      process.env.FIREBASE_CONFIG = firebaseConfig;
      process.env.FIREBASE_PROJECT = firebaseConfig; // To make pre-1.0 firebase-functions SDK work
      process.env.GCLOUD_PROJECT = projectId;
      logger.debug("Starting @google-cloud/functions-emulator");
      return controller.start();
    })
    .then(function() {
      logger.debug("Parsing function triggers");
      return parseTriggers(projectId, functionsDir, {}, firebaseConfig).catch(function(e) {
        utils.logWarning(
          chalk.yellow("functions:") +
            " Failed to load functions source code. " +
            "Ensure that you have the latest SDK by running " +
            chalk.bold("npm i --save firebase-functions") +
            " inside the functions directory."
        );
        logger.debug("Error during trigger parsing: ", e.message);
        return Promise.reject(e.message);
      });
    })
    .then(function(triggers) {
      instance.triggers = triggers;
      var promises = _.map(triggers, function(trigger) {
        if (trigger.httpsTrigger) {
          return controller
            .deploy(trigger.name, {
              entryPoint: trigger.entryPoint,
              firebase: true,
              source: functionsDir,
              triggerHttp: true,
            })
            .catch(function(e) {
              logger.debug("Error while deploying to emulator: " + e + "\n" + e.stack);
              return Promise.reject({ name: trigger.name });
            });
        }
        if (!shellMode) {
          utils.logBullet(
            chalk.cyan.bold("functions:") +
              " No HTTPS functions found. Use " +
              chalk.bold("firebase functions:shell") +
              " if you would like to emulate other types of functions."
          );
          return Promise.resolve(); // Don't emulate non-HTTPS functions if shell not running
        }
        logger.debug("Deploying functions locally");
        return controller
          .deploy(trigger.name, {
            entryPoint: trigger.entryPoint,
            eventType: trigger.eventTrigger.eventType,
            firebase: true,
            resource: trigger.eventTrigger.resource,
            source: functionsDir,
          })
          .catch(function(e) {
            logger.debug("Error while deploying to emulator: " + e + "\n" + e.stack);
            return Promise.reject({ name: trigger.name });
          });
      });
      return utils.promiseAllSettled(promises);
    })
    .then(function(operations) {
      return Promise.all(
        _.map(operations, function(operation) {
          if (operation.state === "rejected") {
            utils.logWarning(
              chalk.yellow("functions:") +
                " Failed to emulate " +
                _.get(operation, "reason.name", "")
            );
            return Promise.resolve();
          }
          if (!operation.value) {
            return Promise.resolve(); // Emulation was not attempted
          }
          return _pollOperation(operation.value, controller).then(function(res) {
            var funcName = _.chain(res)
              .get("name")
              .split("/")
              .last()
              .value();
            emulatedFunctions.push(funcName);
            if (res.httpsTrigger) {
              emulatedProviders.HTTPS = true;
              var message = chalk.green.bold("functions: ") + funcName.replace(/\-/g, ".");
              instance.urls[funcName] = res.httpsTrigger.url;
              if (!shellMode) {
                message += ": " + chalk.bold(res.httpsTrigger.url);
              }
              utils.logSuccess(message);
            } else {
              var provider = utils.getFunctionsEventProvider(res.eventTrigger.eventType);
              emulatedProviders[provider] = true;
              utils.logSuccess(chalk.green.bold("functions: ") + funcName.replace(/\-/g, "."));
            }
          });
        })
      );
    })
    .then(function() {
      var providerList = _.keys(emulatedProviders)
        .sort()
        .join(",");
      if (emulatedFunctions.length > 0) {
        track("Functions Emulation", providerList, emulatedFunctions.length);
      } else {
        return instance.stop();
      }
    })
    .catch(function(e) {
      if (e) {
        utils.logWarning(chalk.yellow("functions:") + " Error from emulator. " + e);
        logger.debug(e.stack);
      }
      return instance.stop();
    });
};

module.exports = FunctionsEmulator;
