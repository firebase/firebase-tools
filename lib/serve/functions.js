'use strict';

var EmulatorController = require('@google-cloud/functions-emulator/src/cli/controller');
var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var getProjectId = require('../getProjectId');
var logger = require('../logger');
var parseTriggers = require('../parseTriggers');
// var pollOperation = require('../pollOperation');

var controller;

function _startEmulator(options) {
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  controller = new EmulatorController({verbose: true});
  // TODO
  // handle port in use
  // allow port and other config
  // work on logger ordering
  // pipe the logs
  // handle deploy fail, etc.
  // errors from trigger parsing do not display a helpful message
  logger.info('Starting Cloud Functions Emulator...');
  logger.info(chalk.bold('Functions Directory:'), 'functions');

  controller.start().then(function() {
    return controller.clear();
  }).then(function() {
    return parseTriggers(getProjectId(options), options.instance, functionsDir);
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
    return RSVP.all(_.map(operations, function(operation) {
      var funcName = _.chain(operation[0]).get('metadata.value.target').split('/').last().value();
      return controller.client.getFunction(funcName).then(function(res) {
        // TODO need to actually poll for the competion of the deploys here
        // console.log(res[0])
        logger.info(funcName + ': ' + chalk.bold(res[0].httpsTrigger.url));
      });
    }));
  }).then(function() {
    // Hack to keep process from terminating when only serving functions
    setInterval(function() {}, Number.POSITIVE_INFINITY);
  }).catch(function(e) {
    logger.error(e);
  });
}

function _stopEmulator() {
  return new RSVP.Promise(function(resolve) {
    controller.stop().then(resolve);
    // Force-kill controller after 0.5 s
    setInterval(function() {
      controller.kill().then(resolve);
    }, 500);
  });
}

module.exports = {
  start: _startEmulator,
  stop: _stopEmulator
};
