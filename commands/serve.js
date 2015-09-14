'use strict';

var superstatic = require('superstatic').server;
var chalk = require('chalk');
var RSVP = require('rsvp');
var loadConfig = require('../lib/loadConfig');
var Command = require('../lib/command');
var logger = require('../lib/logger');

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen', 5000)
  .option('-o, --host <host>', 'the host on which to listen', 'localhost')
  .action(function(options) {
    loadConfig();

    superstatic({
      debug: true,
      port: options.port,
      host: options.host
    }).listen();

    logger.info('Listening at', chalk.underline(chalk.bold('http://' + options.host + ':' + options.port)));

    return new RSVP.Promise(function(resolve) {
      process.on('SIGINT', function() {
        logger.info('Shutting down...');
        resolve();
      });
    });
  });
