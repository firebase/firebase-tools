'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var requireAuth = require('../lib/requireAuth');

module.exports = new Command('prefs:token')
  .description('print the currently logged in user\'s access token')
  .before(requireAuth)
  .option('--temporary', 'only provide a temporary access token that will expire in an hour')
  .action(function(options) {
    var token = options.temporary ? options.tokens.access_token : options.tokens.refresh_token;
    logger.info(token);
    return token;
  });
