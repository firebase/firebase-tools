'use strict';

var repl = require('repl');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('request');
var util = require('util');

var FunctionsEmulator = require('../lib/functionsEmulator');
var LocalFunction = require('../lib/localFunction');
var Command = require('../lib/command');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var scopes = require('../lib/scopes');

module.exports = new Command('experimental:functions:shell')
  .description('launch full Node shell with emulated functions')
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

      var writer = function(output) {
        // Prevent full print out of Request object when a request is made
        if (output instanceof request.Request) {
          return 'Sent request to function.';
        }
        return util.inspect(output);
      };

      var prompt = 'firebase > ';

      var replServer = repl.start({
        prompt: prompt,
        writer: writer,
        useColors: true
      });

      _.forEach(emulator.triggers, function(trigger) {
        if (_.includes(emulator.emulatedFunctions, trigger.name)) {
          var localFunction = new LocalFunction(trigger, emulator.urls, emulator.controller);
          replServer.context[trigger.name] = localFunction.call;
        }
      });
      replServer.context.config = emulator.config;
      replServer.context.help = 'Instructions for the Functions Shell can be found at: ' +
        'https://firebase.google.com/docs/functions/local-emulator';
    }).then(function() {
      return new RSVP.Promise(function(resolve) {
        process.on('SIGINT', function() {
          return emulator.stop().then(resolve).catch(resolve);
        });
      });
    });
  });
