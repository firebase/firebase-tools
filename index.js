'use strict';

var program = require('commander');
var pkg = require('./package.json');
var chalk = require('chalk');
var logger = require('./lib/logger');
var didYouMean = require('didyoumean');

program.version(pkg.version);
program.option('-j, --json', 'output JSON instead of text, also triggers non-interactive mode');
program.option('--token <token>', 'supply an auth token for this command');
program.option('--non-interactive', 'error out of the command instead of waiting for prompts');
program.option('--interactive', 'force interactive shell treatment even when not detected');
program.option('--debug', 'print verbose debug output and keep a debug log file');
// program.option('-d, --debug', 'display debug information and keep firebase-debug.log');

var client = {};
client.cli = program;
client.logger = require('./lib/logger');
client.errorOut = function(error, status) {
  require('./lib/errorOut')(client, error, status);
};
client.getCommand = function(name) {
  for (var i = 0; i < client.cli.commands.length; i++) {
    if (client.cli.commands[i]._name === name) {
      return client.cli.commands[i];
    }
  }
  return null;
};

require('./commands')(client);

var commandNames = program.commands.map(function(cmd) {
  return cmd._name;
});

program.action(function(cmd, cmd2) {
  logger.error(
    chalk.bold.red('Error:'),
    chalk.bold(cmd), 'is not a Firebase command'
  );

  if (cmd === 'delete-site') {
    logger.error();
    logger.error(chalk.bold('delete-site') + ' has been renamed, please run', chalk.bold('firebase disable:hosting'), 'instead');
  } else {
    var suggestion = didYouMean(cmd, commandNames);
    suggestion = suggestion || didYouMean([cmd, cmd2].join(':'), commandNames);
    if (suggestion) {
      logger.error();
      logger.error('Did you mean', chalk.bold(suggestion) + '?');
    }
  }

  process.exit(1);
});

module.exports = client;
