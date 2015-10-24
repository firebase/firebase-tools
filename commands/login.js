'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var configstore = require('../lib/configstore');
var chalk = require('chalk');
var utils = require('../lib/utils');
var RSVP = require('rsvp');
var auth = require('../lib/auth');
var _ = require('lodash');

module.exports = new Command('login')
  .description('log the CLI into Firebase')
  .option('--no-localhost', 'copy and paste a code instead of starting a local server for authentication')
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject('Cannot run login in non-interactive mode. See ' +
        chalk.bold('login:ci') + ' to generate a token for use in non-interactive environments.', {exit: 1});
    }

    var user = configstore.get('user');
    var tokens = configstore.get('tokens');

    if (user && tokens) {
      logger.info('Already logged in as', chalk.bold(user.email));
      return RSVP.resolve(user);
    }
    return auth.login(options.localhost).then(function(result) {
      configstore.set('user', result.user);
      configstore.set('tokens', result.tokens);

      // TODO: set this in the login flow
      configstore.set('usage', _.get(result, 'prefs.usage', false));

      utils.logSuccess('Success! Logged in as ' + chalk.bold(result.user.email));

      return auth;
    });
  });
