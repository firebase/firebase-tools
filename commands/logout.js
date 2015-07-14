'use strict';

var Command = require('../lib/command');
var configstore = require('../lib/configstore');
var logger = require('../lib/logger');
var chalk = require('chalk');

module.exports = new Command('logout')
  .description('delete local authentication information')
  .action(function(options, resolve) {
    var user = configstore.get('user');
    if (user) {
      configstore.del('user');
      logger.info('Logged out from', chalk.bold(user.google.email));
    } else {
      logger.info('No need to logout, not logged in');
    }

    resolve();
  });
