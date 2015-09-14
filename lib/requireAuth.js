'use strict';

// var configstore = require('./configstore');
var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');

module.exports = function() {
  var config = require('./auth').getConfig();

  if (config) {
    return RSVP.resolve();
  }
  return RSVP.reject(new FirebaseError('Command requires authentication, please run ' + chalk.bold('firebase login'), {
    exit: 1
  }));

  // if (configstore.get('user')) {
  //   options.user = configstore.get('user');
  //   return RSVP.resolve(options);
  // }
  //
  // return RSVP.reject(new FirebaseError('Command requires authentication, please run ' + chalk.bold('firebase login'), {
  //   exit: 1
  // }));
};
