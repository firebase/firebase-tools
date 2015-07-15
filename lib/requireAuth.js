'use strict';

var RSVP = require('rsvp');
var configstore = require('./configstore');
var FirebaseError = require('./error');
var chalk = require('chalk');

module.exports = function(options, resolve, reject) {
  if (configstore.get('user')) {
    options.user = configstore.get('user');
    resolve(options);
  } else {
    reject(new FirebaseError('Command requires authentication, please run ' + chalk.bold('firebase login'), {
      status: 401,
      exit: 1
    }));
  }
};
