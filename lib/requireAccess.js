'use strict';

var _ = require('lodash');

var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');
var api = require('./api');
var requireAuth = require('./requireAuth');
var getProjectId = require('./getProjectId');
var getInstanceId = require('./getInstanceId');

module.exports = function(options) {
  var projectId = getProjectId(options);
  options.project = projectId;

  return requireAuth(options).then(function() {
    return getInstanceId(options);
  }).then(function(instance) {
    options.instance = instance;
    return api.request('GET', '/v1/database/' + options.instance + '/tokens', {auth: true});
  }).then(function(res) {
    options.databaseAdminToken = res.body.data;
    options.metadataToken = res.body.metadata;
    return;
  }).catch(function(err) {
    if (err && err.exit && _.get(err, 'context.body.error.code') !== 'PROJECT_NOT_FOUND') {
      return RSVP.reject(err);
    }

    return RSVP.reject(new FirebaseError(
      'Unable to authorize access to project ' + chalk.bold(projectId) + '\n\n' +
      chalk.bold.cyan('Note:') + ' This version of the Firebase CLI is only compatible with projects upgraded\n' +
      'to the new Firebase Console. To access firebase.com apps, you will need to\n' +
      'use a previous version: ' + chalk.bold('npm install -g firebase-tools@^2.1') + '\n\n' +
      'To access the Firebase Console, visit ' + chalk.underline('https://console.firebase.google.com/'), {
        exit: 1
      }));
  });
};
