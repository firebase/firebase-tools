'use strict';

var Command = require('../lib/command');
var RSVP = require('rsvp');
var chalk = require('chalk');
var logger = require('../lib/logger');

module.exports = new Command('help [command]')
  .description('display help information')
  .action(function(commandName) {
    var cmd = this.client.getCommand(commandName);
    if (cmd) {
      cmd.outputHelp();
    } else if (commandName) {
      logger.warn();
      logger.warn(' ', chalk.yellow('⚠ '), chalk.bold(commandName), 'is not a valid command. See below for valid commands');
      this.client.cli.outputHelp();
    } else {
      this.client.cli.outputHelp();
      logger.info();
      logger.info('  To get help with a specific command, type', chalk.bold('firebase help [command_name]'));
      logger.info();
    }

    RSVP.resolve();
  });
