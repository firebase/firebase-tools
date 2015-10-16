'use strict';

var Command = require('../lib/command');
var configstore = require('../lib/configstore');
var logger = require('../lib/logger');
var chalk = require('chalk');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var api = require('../lib/api');
var _ = require('lodash');

module.exports = new Command('logout')
  .description('log the CLI out of Firebase')
  .action(function(options) {
    var user = configstore.get('user');
    var session = configstore.get('session');
    var currentToken = _.get(session, 'token');
    var token = utils.getInheritedOption(options, 'token') || currentToken;
    api.setToken(token);
    var next;
    if (token) {
      next = api.request('DELETE', '/account/token', {
        auth: true
      });
    } else {
      next = RSVP.resolve();
    }

    var cleanup = function() {
      if (token || user || session) {
        var msg = 'Logged out';
        if (token === currentToken) {
          configstore.del('user');
          configstore.del('session');
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
      utils.logWarning('Invalid session token, did not need to deauthorize');
      cleanup();
    });
  });
