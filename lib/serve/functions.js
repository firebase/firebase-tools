'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var getProjectId = require('../getProjectId');
var logger = require('../logger');
var utils = require('../utils');
var parseTriggers = require('../parseTriggers');
var EmulatorController;
var controller;

function _pollOperation(service, operation) {
  return new RSVP.Promise(function(resolve, reject) {
    var poll = function() {
      service.operations.get({
        name: operation[0].name
      }, function(err, _operation) {
        if (err) {
          reject(err);
        } else if (_operation.done) {
        // TODO: handle deploy failures
          resolve(_operation.response.value);
        } else {
          setTimeout(poll, 500);
        }
      });
    };
    poll();
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
    utils.logWarning('Cannot start functions emulator. ' + msg);
    return RSVP.reject();
  }
  if (process.version !== 'v6.9.1') {
    utils.logWarning('The functions emulator works best with Node version v6.9.1, you have ' + process.version + '\n');
  }
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  controller = new EmulatorController({verbose: true});
  // TODO: pipe logs to console
  logger.info('Starting Cloud Functions Emulator...');
  logger.info(chalk.bold('Functions Directory:'), options.config.get('functions.source'), '\n');

  controller.start().then(function() {
    return controller.clear();
  }).then(function() {
    return parseTriggers(getProjectId(options), options.instance, functionsDir);
  // TODO: display helpful message when there are errors from trigger parsing
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
    return controller.client.getService().then(function(service) {
      return RSVP.all(_.map(operations, function(operation) {
        return _pollOperation(service, operation).then(function(res) {
          var funcName = _.chain(res).get('name').split('/').last().value();
          logger.info(funcName + ': ' + chalk.bold(res.httpsTrigger.url));
        });
      }));
    });
  }).then(function() {
    // Hack to keep process from terminating when only serving functions
    setInterval(function() {}, Number.POSITIVE_INFINITY);
  }).catch(function(e) {
    logger.error(e);
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

module.exports = {
  start: _startEmulator,
  stop: _stopEmulator
};
