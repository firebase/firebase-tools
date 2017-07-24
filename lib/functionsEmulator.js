'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var fs = require('fs-extra');
var getProjectId = require('./getProjectId');
var utils = require('./utils');
var parseTriggers = require('./parseTriggers');
var functionsConfig = require('./functionsConfig');
var ensureDefaultCredentials = require('./ensureDefaultCredentials');

var EmulatorController;

var FunctionsEmulator = function(options) {
  this.controller = null;
  this.emulatedFunctions = [];
  this.options = options;
  this.config = {};
  this.triggers = [];
};

var _pollOperation = function(op, controller) {
  return new RSVP.Promise(function(resolve, reject) {
    var poll = function() {
      controller.client.getOperation(op[0].name)
        .then(function(results) {
          var operation = results[0];
          if (operation.done) {
            if (operation.response) {
              resolve(operation.response.value);
            } else {
              reject(operation.error || new Error('Deployment failed'));
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
  delete process.env.FIREBASE_PROJECT;
  var controller = this.controller;
  return new RSVP.Promise(function(resolve) {
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
    restPort: this.options.port,
    grpcPort: this.options.port + 1,
    supervisorPort: this.options.port + 2
  };
  if (_.includes(this.options.targets, 'hosting')) {
    return _.mapValues(portsConfig, function(port) {
      return port + 1; // bump up port numbers by 1 so hosting can be served on first port
    });
  }
  return portsConfig;
};

FunctionsEmulator.prototype.start = function() {
  var options = this.options;
  var projectId = getProjectId(options);
  var emulatedFunctions = this.emulatedFunctions;
  var instance = this;
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  var ports = this._getPorts();
  var controllerConfig = _.merge({tail: true, service: 'rest'}, ports);
  var firebaseConfig;

  try {
    // Require must be inside try/catch, since it's an optional dependency. As well, require may fail if node version incompatible.
    var emulatorConfig = require('@google-cloud/functions-emulator/src/config');
    // Must set projectId here instead of later when initializing the controller,
    // otherwise emulator may crash since it is looking for a config file in /src/options.js
    emulatorConfig.set('projectId', projectId); // creates config file in a directory known to the emulator
    EmulatorController = require('@google-cloud/functions-emulator/src/cli/controller');
  } catch (err) {
    var msg = err;
    if (process.version !== 'v6.9.1') {
      msg = 'Please use Node version v6.9.1, you have ' + process.version + '\n';
    }
    utils.logWarning(chalk.yellow('functions:') + ' Cannot start emulator. ' + msg);
    return RSVP.reject();
  }

  this.controller = new EmulatorController(controllerConfig);
  var controller = this.controller;

  utils.logBullet(chalk.cyan.bold('functions:') + ' Preparing to emulate HTTPS functions. Support for other event types coming soon.');
  ensureDefaultCredentials();
  return functionsConfig.materializeAll(projectId)
  .then(function(result) {
    fs.ensureFileSync('.runtimeconfig.json');
    fs.writeFileSync('.runtimeconfig.json', JSON.stringify(result, null, 2));
    instance.config = result;
    return functionsConfig.getFirebaseConfig(projectId, options.instance);
  }).then(function(result) {
    firebaseConfig = JSON.stringify(result);
    instance.config.firebase = firebaseConfig;
    process.env.FIREBASE_PROJECT = firebaseConfig;
    return controller.start();
  }).then(function() {
    return parseTriggers(projectId, functionsDir, firebaseConfig);
  }).catch(function(e) {
    utils.logWarning(chalk.yellow('functions:') + ' Failed to load functions source code. ' +
      'Ensure that you have the latest SDK by running ' + chalk.bold('npm i --save firebase-functions') +
      ' inside the functions directory. Please note that emulation of custom config values are not supported yet. ' +
      'Run ' + chalk.bold('firebase serve --only hosting') + ' to only serve hosting files.\n\n' + e);
    return RSVP.resolve();
  }).then(function(triggers) {
    instance.triggers = triggers;
    var promises = _.map(triggers, function(trigger) {
      if (trigger.httpsTrigger) {
        return controller.deploy(trigger.name, {
          localPath: functionsDir,
          triggerHttp: true
        }).catch(function() {
          return RSVP.reject({name: trigger.name});
        });
      }
      var parts = trigger.eventTrigger.eventType.split('/');
      var triggerProvider = parts[1];
      var triggerEvent = parts[3];
      return controller.deploy(trigger.name, {
        localPath: functionsDir,
        triggerProvider: triggerProvider,
        triggerEvent: triggerEvent,
        triggerResource: trigger.eventTrigger.resource
      });
    });
    return RSVP.allSettled(promises);
  }).then(function(operations) {
    return RSVP.all(_.map(operations, function(operation) {
      if (operation.state === 'rejected') {
        utils.logWarning(chalk.yellow('functions:') + ' Failed to emulate ' + operation.reason.name);
        return RSVP.resolve();
      }
      return _pollOperation(operation.value, controller).then(function(res) {
        var funcName = _.chain(res).get('name').split('/').last().value();
        emulatedFunctions.push(funcName);
        if (res.httpsTrigger) {
          utils.logSuccess(chalk.green.bold('functions: ') + funcName + ': ' + chalk.bold(res.httpsTrigger.url));
        } else {
          utils.logSuccess(chalk.green.bold('functions: ') + funcName);
        }
      });
    }));
  }).catch(function(e) {
    if (e) {
      utils.logWarning(chalk.yellow('functions:') + ' Error from emulator. ' + e.stack);
    }
    return instance.stop();
  });
};

module.exports = FunctionsEmulator;
