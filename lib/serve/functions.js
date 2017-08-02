'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var getProjectId = require('../getProjectId');
var utils = require('../utils');
var parseTriggers = require('../parseTriggers');
var functionsConfig = require('../functionsConfig');
var ensureDefaultCredentials = require('../ensureDefaultCredentials');
var track = require('../track');
var EmulatorController;
var controller;

function _pollOperation(op) {
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
}

function _stopEmulator() {
  delete process.env.FIREBASE_PROJECT;
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
}

function _getPorts(options) {
  var portsConfig = {
    restPort: options.port + 2,
    grpcPort: options.port + 1,
    supervisorPort: options.port
  };
  if (_.includes(options.targets, 'hosting')) {
    return _.mapValues(portsConfig, function(port) {
      return port + 1; // bump up port numbers by 1 so hosting can be served on first port
    });
  }
  return portsConfig;
}

function _startEmulator(options) {
  var projectId = getProjectId(options);
  try {
    // Require must be inside try/catch, since it's an optional dependency. As well, require may fail if node version incompatible.
    var emulatorConfig = require('@google-cloud/functions-emulator/src/config');
    // Must set projectId here instead of later when initializing the controller,
    // otherwise emulator may crash since it is looking for a config file in /src/options.js
    emulatorConfig.set('projectId', projectId); // creates config file in a directory known to the emulator
    EmulatorController = require('@google-cloud/functions-emulator/src/cli/controller');
  } catch (err) {
    var msg = err;
    if (process.version !== 'v6.11.1') {
      msg = 'Please use Node version v6.11.1, you have ' + process.version + '\n';
    }
    utils.logWarning(chalk.yellow('functions:') + ' Cannot start emulator. ' + msg);
    return RSVP.reject();
  }
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  var controllerConfig = _.merge({tail: true}, _getPorts(options));
  utils.logBullet(chalk.cyan.bold('functions:') + ' Preparing to emulate HTTPS functions. Support for other event types coming soon.');

  controller = new EmulatorController(controllerConfig);
  var firebaseConfig;

  ensureDefaultCredentials();
  return functionsConfig.getFirebaseConfig(projectId, options.instance)
  .then(function(result) {
    firebaseConfig = JSON.stringify(result);
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
    var functionsEmulated = 0;
    var promises = _.map(triggers, function(trigger) {
      if (trigger.httpsTrigger) {
        functionsEmulated += 1;
        return controller.deploy(trigger.name, {
          localPath: functionsDir,
          triggerHttp: true
        }).catch(function() {
          return RSVP.reject({name: trigger.name});
        });
      }
      return RSVP.resolve(); // TODO: support other trigger types
    });
    if (functionsEmulated > 0) {
      track('Functions Emulation', 'HTTPS', functionsEmulated);
    }
    return RSVP.allSettled(promises);
  }).then(function(operations) {
    var functionUrls = {};
    return RSVP.all(_.map(operations, function(operation) {
      if (operation.state === 'rejected') {
        utils.logWarning(chalk.yellow('functions:') + ' Failed to emulate ' + operation.reason.name);
        return RSVP.resolve();
      }
      if (!operation.value) {
        return RSVP.resolve(); // it was a non-HTTPS trigger
      }
      return _pollOperation(operation.value).then(function(res) {
        var funcName = _.chain(res).get('name').split('/').last().value();
        functionUrls[funcName] = res.httpsTrigger.url;
      });
    })).then(function() {
      return functionUrls;
    });
  }).then(function(functionUrls) {
    if (_.size(functionUrls) === 0) {
      utils.logBullet(chalk.cyan.bold('functions: ') + 'No HTTPS functions emulated. ' +
        'Support for other function types are coming soon.');
      return;
    }
    _.forEach(functionUrls, function(url, funcName) {
      utils.logSuccess(chalk.green.bold('functions: ') + funcName + ': ' + chalk.bold(url));
    });
  }).catch(function(e) {
    utils.logWarning(chalk.yellow('functions:') + ' Error from emulator. ' + e.stack);
    return _stopEmulator();
  });
}

module.exports = {
  start: _startEmulator,
  stop: _stopEmulator
};
