'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var getProjectId = require('../getProjectId');
var utils = require('../utils');
var parseTriggers = require('../parseTriggers');
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

function _startEmulator(options) {
  try {
    EmulatorController = require('@google-cloud/functions-emulator/src/cli/controller');
  } catch (err) {
    var msg = err;
    if (process.version !== 'v6.9.1') {
      msg = 'Please use Node version v6.9.1, you have ' + process.version + '\n';
    }
    utils.logWarning(chalk.yellow('functions:') + ' Cannot start emulator. ' + msg);
    return RSVP.reject();
  }
  if (process.version !== 'v6.9.1') {
    utils.logWarning(chalk.yellow('functions:') + ' The emulator works best with Node version v6.9.1, you have ' + process.version + '\n');
  }
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  var projectId = getProjectId(options);
  controller = new EmulatorController({tail: true, projectId: projectId});
  return controller.start({ detached: false, stdio: ['ignore', process.stdout, process.stderr]}).then(function() {
    return controller.clear().catch(_.noop); // undeploys previously locally deployed functions
  }).then(function() {
    return parseTriggers(projectId, options.instance, functionsDir);
  // TODO: display better formatted message when there are errors from trigger parsing
  }).then(function(triggers) {
    var promises = _.map(triggers, function(trigger) {
      if (trigger.httpsTrigger) {
        return controller.deploy(trigger.name, {
          localPath: functionsDir,
          triggerHttp: true
        });
      }
      return RSVP.resolve(); // TODO: support other trigger types
    });
    return RSVP.all(promises);
  }).then(function(operations) {
    var functionUrls = {};
    return RSVP.all(_.map(operations, function(operation) {
      return _pollOperation(operation).then(function(res) {
        var funcName = _.chain(res).get('name').split('/').last().value();
        functionUrls[funcName] = res.httpsTrigger.url;
      });
    })).then(function() {
      return functionUrls;
    });
  }).then(function(functionUrls) {
    _.forEach(functionUrls, function(url, funcName) {
      utils.logSuccess(chalk.green.bold('functions: ') + funcName + ': ' + chalk.bold(url));
    });
    // Hack to keep process from terminating when only serving functions
    setInterval(function() {}, Number.POSITIVE_INFINITY);
  }).catch(function(e) {
    utils.logWarning(chalk.yellow('functions:') + ' Error from emulator. ' + e);
    return _stopEmulator();
  });
}

module.exports = {
  start: _startEmulator,
  stop: _stopEmulator
};
