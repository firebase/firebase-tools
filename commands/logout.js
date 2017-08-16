'use strict';

var Command = require('../lib/command');
var configstore = require('../lib/configstore');
var logger = require('../lib/logger');
var chalk = require('chalk');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var api = require('../lib/api');
var auth = require('../lib/auth');
var _ = require('lodash');

module.exports = new Command('logout')
  .description('log the CLI out of Firebase')
  .action(function(options) {
    var user = configstore.get('user');
    var tokens = configstore.get('tokens');
    var currentToken = _.get(tokens, 'refresh_token');
    var token = utils.getInheritedOption(options, 'token') || currentToken;
    api.setRefreshToken(token);
    var next;
    if (token) {
      next = auth.logout(token);
    } else {
      next = RSVP.resolve();
    }

    var cleanup = function() {
      if (token || user || tokens) {
        var msg = 'Logged out';
        if (token === currentToken) {
          if (user) {
            msg += ' from ' + chalk.bold(user.email);
          }
        } else {
          msg += ' token "' + chalk.bold(token) + '"';
        }
        utils.logSuccess(msg);
      } else {
        logger.info('No need to logout, not logged in');
      }
    };

    return next.then(cleanup, function() {
      utils.logWarning('Invalid refresh token, did not need to deauthorize');
      cleanup();
    });
  });
