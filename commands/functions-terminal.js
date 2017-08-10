'use strict';

var repl = require('repl');
var _ = require('lodash');
var RSVP = require('rsvp');
var FunctionsEmulator = require('../lib/functionsEmulator');
var CallableFunction = require('../lib/callableFunction');
var Command = require('../lib/command');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var scopes = require('../lib/scopes');

module.exports = new Command('functions:terminal')
  .description('launch terminal with emulated functions')
  .option('-p, --port <port>', 'the port on which to emulate functions (default: 5000)', 5000)
  .before(requireConfig)
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    options.port = parseInt(options.port, 10);
    var emulator = new FunctionsEmulator(options);

    return emulator.start(true).then(function() {
      if (emulator.emulatedFunctions.length === 0) {
        logger.info('No functions emulated.');
        process.exit();
      }
      var replServer = repl.start({
        prompt: 'functions > '
      });
      _.forEach(emulator.triggers, function(trigger) {
        if (_.includes(emulator.emulatedFunctions, trigger.name)) {
          var callableFunction = new CallableFunction(trigger, emulator.urls, emulator.controller);
          replServer.context[trigger.name] = callableFunction.call;
        }
      });
      replServer.context.config = emulator.config;
    }).then(function() {
      return new RSVP.Promise(function(resolve) {
        process.on('SIGINT', function() {
          return emulator.stop().then(resolve).catch(resolve);
        });
      });
    });
  });
