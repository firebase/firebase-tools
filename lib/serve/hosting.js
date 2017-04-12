'use strict';

var chalk = require('chalk');
var FirebaseError = require('../error');
var logger = require('../logger');
var RSVP = require('rsvp');
var superstatic = require('superstatic').server;
var utils = require('../utils');
var detectProjectRoot = require('../detectProjectRoot');
var hostingImplicitInit = require('../hostingImplicitInit');
var hostingInitMiddleware = require('../hostingInitMiddleware');

var MAX_PORT_ATTEMPTS = 10;
var _attempts = 0;

function _startServer(options) {
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
        logger.info(chalk.bold('Hosting Directory:'), config.public, '\n');
      }
      logger.info('Hosting server: ' + chalk.underline(chalk.bold('http://' + options.host + ':' + options.port)) + '\n');
    });

    server.on('error', function(err) {
      if (err.code === 'EADDRINUSE') {
        var message = 'Port ' + options.port + ' is not available.';
        if (_attempts < MAX_PORT_ATTEMPTS) {
          utils.logWarning(message + ' Trying another port...');
          options.port++;
          _attempts++;
          _startServer(options);
        } else {
          utils.logWarning(message);
          throw new FirebaseError('Could not find an open port for development server.', {exit: 1});
        }
      } else {
        throw new FirebaseError('An error occurred while starting the development server:\n\n' + err.toString(), {exit: 1});
      }
    });
  });
}

function _stopServer() {
  return RSVP.resolve();
}

module.exports = {
  start: _startServer,
  stop: _stopServer
};
