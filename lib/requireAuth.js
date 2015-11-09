'use strict';

// var configstore = require('./configstore');
var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');
var configstore = require('./configstore');
var utils = require('./utils');
var api = require('./api');

module.exports = function(options) {
  var tokens = configstore.get('tokens');
  var user = configstore.get('user');

  var tokenOpt = utils.getInheritedOption(options, 'token');
  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    api.setToken(tokenOpt);
    return RSVP.resolve();
  }

  if (!user || !tokens) {
    return RSVP.reject(
      new FirebaseError('Command requires authentication, please run ' + chalk.bold('firebase login')),
      {exit: 1}
    );
  }

  options.user = user;
  options.tokens = tokens;
  api.setToken(tokens.refresh_token);
  return RSVP.resolve();
};
