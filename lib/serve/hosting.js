'use strict';

var chalk = require('chalk');
var FirebaseError = require('../error');
var RSVP = require('rsvp');
var superstatic = require('superstatic').server;
var utils = require('../utils');
var detectProjectRoot = require('../detectProjectRoot');
var implicitInit = require('../hosting/implicitInit');
var initMiddleware = require('../hosting/initMiddleware');
var functionsProxy = require('../hosting/functionsProxy');

var MAX_PORT_ATTEMPTS = 10;
var _attempts = 0;

function _startServer(options) {
  var config = options.config ? options.config.get('hosting') : {public: '.'};

  return implicitInit(options).then(function(init) {
    var server = superstatic({
      debug: true,
      port: options.port,
      host: options.host,
      config: config,
      cwd: detectProjectRoot(options.cwd),
      stack: 'strict',
      before: {
        files: initMiddleware(init)
      },
      rewriters: {
        function: functionsProxy(options)
      }
    }).listen(function() {
      if (config.public && config.public !== '.') {
        utils.logBullet(chalk.cyan.bold('hosting:') + ' Serving hosting files from: ' + chalk.bold(config.public));
      }
      utils.logSuccess(chalk.green.bold('hosting:') + ' Local server: ' +
        chalk.underline(chalk.bold('http://' + options.host + ':' + options.port)) + '\n');
    });

    server.on('error', function(err) {
      if (err.code === 'EADDRINUSE') {
        var message = 'Port ' + options.port + ' is not available.';
        if (_attempts < MAX_PORT_ATTEMPTS) {
          utils.logWarning(chalk.yellow('hosting: ') + message + ' Trying another port...');
          // Another project that's running takes up to 4 ports: 1 hosting port and 3 functions ports
          options.port = options.port + 4;
          _attempts++;
          _startServer(options);
        } else {
          utils.logWarning(message);
          throw new FirebaseError('Could not find an open port for hosting development server.', {exit: 1});
        }
      } else {
        throw new FirebaseError('An error occurred while starting the hosting development server:\n\n' + err.toString(), {exit: 1});
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
