'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var configstore = require('../lib/configstore');
var chalk = require('chalk');
var utils = require('../lib/utils');
var RSVP = require('rsvp');
var login = require('../lib/login');
var _ = require('lodash');

module.exports = new Command('login')
  .description('log the CLI into Firebase')
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject('Cannot run login in non-interactive mode. See ' +
        chalk.bold('login:ci') + ' to generate a token for use in non-interactive environments.', {exit: 1});
    }

    var user = configstore.get('user');
    var session = configstore.get('session');

    if (user && session) {
      logger.info('Already logged in as', chalk.bold(user.email));
      return RSVP.resolve(user);
    }
    return login().then(function(auth) {
      configstore.set('user', auth.user);
      configstore.set('session', auth.session);
      configstore.set('usage', _.get(auth, 'prefs.usage', false));

      utils.logSuccess('Success! Logged in as ' + chalk.bold(auth.user.email));

      return auth;
    });
  });
