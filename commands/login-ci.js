'use strict';

var Command = require('../lib/command');
var chalk = require('chalk');
var utils = require('../lib/utils');
var login = require('../lib/login');

module.exports = new Command('login:ci')
  .description('sign into Firebase ')
  .action(function(options) {
    if (utils.getInheritedOption(options, 'nonInteractive')) {
      return utils.reject('Cannot run login in non-interactive mode. Pass ' + chalk.bold('--token') + ' instead.', {exit: 1});
    }

    return login().then(function(auth) {
      utils.logSuccess('Success! Use this token to login on a CI server: "' + chalk.bold(auth.session.token) + '"');
      return auth;
    });
  });
