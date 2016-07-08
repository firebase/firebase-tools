'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var api = require('./api');
var getInstanceId = require('./getInstanceId');
var getProjectId = require('./getProjectId');
var FirebaseError = require('./error');
var identifierToProjectId = require('./identifierToProjectId');
var requireAuth = require('./requireAuth');

module.exports = function(options, authScopes) {
  var projectId = getProjectId(options);
  options.project = projectId;

  return requireAuth(options, authScopes).then(function() {
    return getInstanceId(options);
  }).then(function(instance) {
    options.instance = instance;
    return api.request('GET', '/v1/database/' + options.instance + '/tokens', {auth: true});
  }).then(function(res) {
    options.metadataToken = res.body.metadata;
    return;
  }).catch(function(err) {
    if (err && err.exit && _.get(err, 'context.body.error.code') !== 'PROJECT_NOT_FOUND') {
      return RSVP.reject(err);
    }

    return identifierToProjectId(projectId).then(function(realProjectId) {
      if (realProjectId) {
        var fixCommand = 'firebase use ' + realProjectId;
        if (options.projectAlias) {
          fixCommand +=  ' --alias ' + options.projectAlias;
        }

        return RSVP.reject(new FirebaseError(
          'Tried to access unrecognized project ' + chalk.bold(projectId) + ', but found matching instance for project ' + chalk.bold(realProjectId) + '.\n\n' +
          'To use ' + chalk.bold(realProjectId) + ' instead, run:\n\n  ' +
          chalk.bold(fixCommand)
        ), {exit: 1});
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
  });
};
