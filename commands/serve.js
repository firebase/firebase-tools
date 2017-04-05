'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');
var superstatic = require('superstatic').server;

var Command = require('../lib/command');
var detectProjectRoot = require('../lib/detectProjectRoot');
var FirebaseError = require('../lib/error');
var hostingImplicitInit = require('../lib/hostingImplicitInit');
var hostingInitMiddleware = require('../lib/hostingInitMiddleware');
var logger = require('../lib/logger');
var utils = require('../lib/utils');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var scopes = require('../lib/scopes');

var MAX_PORT_ATTEMPTS = 10;

var _attempts = 0;
var startServer = function(options) {
  var config = options.config ? options.config.get('hosting') : {public: '.'};

  return hostingImplicitInit(options).then(function(init) {
    var server = superstatic({
      debug: true,
      port: options.port,
      host: options.host,
      config: config,
      cwd: detectProjectRoot(options.cwd),
      stack: 'strict',
      before: {
        files: hostingInitMiddleware(init)
      }
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
  });
};

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen (default: 5000)', 5000)
  .option('-o, --host <host>', 'the host on which to listen (default: localhost)', 'localhost')
  .before(requireConfig)
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(checkDupHostingKeys)
  .action(function(options) {
    logger.info('Starting Firebase development server...');
    logger.info();

    if (options.config) {
      logger.info(chalk.bold('Project Directory:'), options.config.projectDir);
    } else {
      utils.logWarning('No Firebase project directory detected. Serving static content from ' + chalk.bold(options.cwd || process.cwd()));
    }

    return startServer(options).then(function() {
      return new RSVP.Promise(function(resolve) {
        process.on('SIGINT', function() {
          logger.info('Shutting down...');
          resolve();
        });
      });
    });
  });
