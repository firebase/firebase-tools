'use strict';

var Command = require('../lib/command');
var loadConfig = require('../lib/loadConfig');
var logger = require('../lib/logger');
var open = require('open');
var chalk = require('chalk');

module.exports = new Command('open')
  .description('open the URL of the current Firebase app in a browser')
  .action(function(options, resolve) {
    var config = loadConfig();

    var url = 'https://' + config.firebase + '.firebaseapp.com/';
    logger.info('Opening URL in your default browser:');
    logger.info(chalk.bold.underline(url));
    open(url);
    resolve();
  });
