'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');

var api = require('./api');
var configstore = require('./configstore');
var utils = require('./utils');

module.exports = function(options, authScopes) {
  api.setScopes(authScopes);
  options.authScopes = api.commandScopes;

  var tokens = configstore.get('tokens');
  var user = configstore.get('user');

  var tokenOpt = utils.getInheritedOption(options, 'token');
  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    api.setToken(tokenOpt);
    return RSVP.resolve();
  }

  if (!user || !tokens) {
    if (configstore.get('session')) {
      return utils.reject('This version of Firebase CLI requires reauthentication.\n\nPlease run ' + chalk.bold('firebase login') + ' to regain access.');
    }
    return utils.reject('Command requires authentication, please run ' + chalk.bold('firebase login'));
  }

  options.user = user;
  options.tokens = tokens;
  api.setToken(tokens.refresh_token);
  return RSVP.resolve();
};
