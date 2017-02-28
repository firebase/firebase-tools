'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var configstore = require('../lib/configstore');
var chalk = require('chalk');
var utils = require('../lib/utils');
var prompt = require('../lib/prompt');
var RSVP = require('rsvp');
var auth = require('../lib/auth');

module.exports = new Command('login')
  .description('log the CLI into Firebase')
  .option('--no-localhost', 'copy and paste a code instead of starting a local server for authentication')
  .option('--reauth', 'force reauthentication even if already logged in')
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject('Cannot run login in non-interactive mode. See ' +
        chalk.bold('login:ci') + ' to generate a token for use in non-interactive environments.', {exit: 1});
    }

    var user = configstore.get('user');
    var tokens = configstore.get('tokens');

    if (user && tokens && !options.reauth) {
      logger.info('Already logged in as', chalk.bold(user.email));
      return RSVP.resolve(user);
    }

    return prompt(options, [{
      type: 'confirm',
      name: 'collectUsage',
      message: 'Allow Firebase to collect anonymous CLI usage information?'
    }]).then(function() {
      configstore.set('usage', options.collectUsage);
      return auth.login(options.localhost);
    }).then(function(result) {
      configstore.set('user', result.user);
      configstore.set('tokens', result.tokens);
      // store login scopes in case mandatory scopes grow over time
      configstore.set('loginScopes', result.scopes);
      // remove old session token, if it exists
      configstore.del('session');

      logger.info();
      utils.logSuccess('Success! Logged in as ' + chalk.bold(result.user.email));

      return auth;
    });
  });
