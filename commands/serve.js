'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');
var superstatic = require('superstatic').server;
var FunctionsController = require('@google-cloud/functions-emulator/src/cli/controller');
var _ = require('lodash');
var path = require('path');

var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var logger = require('../lib/logger');
var utils = require('../lib/utils');
var requireConfig = require('../lib/requireConfig');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var getProjectId = require('../lib/getProjectId');
var parseTriggers = require('../lib/parseTriggers');

var MAX_PORT_ATTEMPTS = 10;
var _attempts = 0;
var startServer = function(options) {
  var config = options.config ? options.config.get('hosting') : {public: '.'};
  var server = superstatic({
    debug: true,
    port: options.port,
    host: options.host,
    config: config,
    stack: 'strict'
  }).listen(function() {
    if (config.public && config.public !== '.') {
      logger.info(chalk.bold('Public Directory:'), config.public);
    }
    logger.info();
    logger.info('Server listening at: ' + chalk.underline(chalk.bold('http://' + options.host + ':' + options.port)));
  });

  server.on('error', function(err) {
    if (err.code === 'EADDRINUSE') {
      var message = 'Port ' + options.port + ' is not available.';
      if (_attempts < MAX_PORT_ATTEMPTS) {
        utils.logWarning(message + ' Trying another port...');
        options.port++;
        _attempts++;
        startServer(options);
      } else {
        utils.logWarning(message);
        throw new FirebaseError('Could not find an open port for development server.', {exit: 1});
      }
    } else {
      throw new FirebaseError('An error occurred while starting the development server:\n\n' + err.toString(), {exit: 1});
    }
  });
};

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen (default: 5000)', 5000)
  .option('-o, --host <host>', 'the host on which to listen (default: localhost)', 'localhost')
  .before(requireConfig)
  .before(checkDupHostingKeys)
  .action(function(options) {
    logger.info('Starting Firebase development server...');
    logger.info();

    if (options.config) {
      logger.info(chalk.bold('Project Directory:'), options.config.projectDir);
    } else {
      utils.logWarning('No Firebase project directory detected. Serving static content from ' + chalk.bold(options.cwd || process.cwd()));
    }

    startServer(options);

    var functionsController = new FunctionsController({verbose: true});
    var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));


    // TODO
    // don't hard code "functions"
    // handle port in use
    // allow port and other config
    // break into own function
    // work on logger ordering
    // pipe the logs
    // don't start up if there aren't functions
    // make sure this works without functions initialized
    // handle deploy fail, etc.
    // double check with jdobry@ that this is an ok flow
    logger.info('Starting ' + functionsController.name + '...');
    logger.info(chalk.bold('Functions Directory:'), 'functions');

    functionsController.start().then(function() {
      return functionsController.clear();
    }).then(function() {
      return parseTriggers(getProjectId(options), options.instance, functionsDir);
    }).then(function(triggers) {
      var promises = _.map(triggers, function(trigger) {
        if (trigger.httpsTrigger) {
          return functionsController.deploy(trigger.name, {
            localPath: functionsDir,
            triggerHttp: true
          });
        }
        return null; // TODO: support other trigger types
      });
      return RSVP.all(promises);
    }).then(function() {
      return functionsController.list();
    }).then(function(cloudFunctions) {
      cloudFunctions.forEach(function(cloudFunction) {
        logger.info(cloudFunction.shortName + ': ' + chalk.bold(cloudFunction.httpsTrigger.url));
      });
    }).catch(function(e) {
      logger.error(e);
    });

    return new RSVP.Promise(function(resolve) {
      process.on('SIGINT', function() {
        logger.info('Shutting down...');
        // doIfRunning()?
        functionsController.then(function() { // TODO this line not right
          return functionsController.stop();
        }).then(function() {
          resolve();
        }).catch(function(e) {
          logger.error(e);
          resolve();
        });
      });
    });
  });
