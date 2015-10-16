'use strict';

var Command = require('../lib/command');
var chalk = require('chalk');
var utils = require('../lib/utils');
var login = require('../lib/login');

module.exports = new Command('login:ci')
  .description('generate an access token for use in non-interactive environments')
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject('Cannot run login:ci in non-interactive mode.', {exit: 1});
    }

    return login().then(function(auth) {
      utils.logSuccess('Success! Use this token to login on a CI server:\n\n' +
        chalk.bold(auth.session.token) + '\n\nExample: firebase deploy --token "$FIREBASE_TOKEN"\n');
      return auth;
    });
  });
