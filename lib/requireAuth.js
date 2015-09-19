'use strict';

// var configstore = require('./configstore');
var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');
var configstore = require('./configstore');

module.exports = function(options) {
  var session = configstore.get('session');
  var user = configstore.get('user');

  var errmsg;
  if (!user || !session) {
    errmsg = 'Command requires authentication';
  } else if (session.expires && session.expires < Date.now()) {
    errmsg = 'Your session has expired';
  }

  if (errmsg) {
    return RSVP.reject(
      new FirebaseError(errmsg + ', please run ' + chalk.bold('firebase login')),
      {exit: 1}
    );
  }

  options.user = user;
  options.session = session;
  return RSVP.resolve();
};
