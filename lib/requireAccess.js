'use strict';

var _ = require('lodash');
var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');
var api = require('./api');
var requireAuth = require('./requireAuth');
var getFirebaseName = require('./getFirebaseName');

module.exports = function(options) {
  var firebase = getFirebaseName(options);
  options.firebase = firebase;

  return requireAuth(options).then(function() {
    return api.request('GET', '/firebase/' + firebase + '/token', {auth: true});
  }).then(function(res) {
    options.dataToken = res.body.personalToken;
    options.adminToken = res.body.firebaseToken;
    return;
  }).catch(function(err) {
    var errCode = _.get(err, 'context.body.error.code');
    if (errCode === 'AUTHENTICATION_REQUIRED') {
      return RSVP.reject(new FirebaseError('Unable to authorize access to ' + chalk.bold(firebase) + '. Check spelling and try again.'));
    }

    return RSVP.reject(_.assign(err, { exit: 1 }));
  });
};
