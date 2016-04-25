'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');
var superstatic = require('superstatic').server;

var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var logger = require('../lib/logger');
var requireConfig = require('../lib/requireConfig');
var utils = require('../lib/utils');

var MAX_PORT_ATTEMPTS = 10;

var _attempts = 0;
var startServer = function(options) {
  var server = superstatic({
    debug: true,
    port: options.port,
    host: options.host,
    config: options.config.get('hosting'),
    stack: 'strict'
  }).listen(function() {
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
    }
  });
};

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen (default: 5000)', 5000)
  .option('-o, --host <host>', 'the host on which to listen (default: localhost)', 'localhost')
  .before(requireConfig)
  .action(function(options) {
    logger.info('Starting Firebase development server...');
    startServer(options);

    return new RSVP.Promise(function(resolve) {
      process.on('SIGINT', function() {
        logger.info('Shutting down...');
        resolve();
      });
    });
  });
