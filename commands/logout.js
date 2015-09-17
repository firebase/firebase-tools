'use strict';

var Command = require('../lib/command');
var configstore = require('../lib/configstore');
var logger = require('../lib/logger');
var chalk = require('chalk');
var RSVP = require('rsvp');

module.exports = new Command('logout')
  .description('delete local authentication data')
  .action(function() {
    var user = configstore.get('user');
    var session = configstore.get('session');
    if (user || session) {
      configstore.del('user');
      configstore.del('session');
      logger.info('Logged out from', chalk.bold(user.email));
    } else {
      logger.info('No need to logout, not logged in');
    }

    return RSVP.resolve();
  });
