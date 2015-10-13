'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var configstore = require('../lib/configstore');
var requireAuth = require('../lib/requireAuth');

module.exports = new Command('prefs:token')
  .description('print the currently logged in user\'s access token')
  .before(requireAuth)
  .action(function() {
    var token = configstore.get('session').token;
    logger.info(token);
    return token;
  });
