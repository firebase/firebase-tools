'use strict';

// var configstore = require('./configstore');
var FirebaseError = require('./error');
var chalk = require('chalk');
var RSVP = require('rsvp');
var api = require('./api');
var requireAuth = require('./requireAuth');
var getProjectId = require('./getProjectId');

module.exports = function(options) {
  var projectId = getProjectId(options);
  options.project = projectId;

  return requireAuth(options).then(function() {
    return api.request('GET', '/projects/' + projectId + '/tokens', {auth: true});
  }).then(function(res) {
    options.databaseAdminToken = res.body.project;
    options.metadataToken = res.body.metadata;
    return;
  }).catch(function(err) {
    if (err && err.exit) {
      return RSVP.reject(err);
    }

    return RSVP.reject(new FirebaseError('Unable to authorize access to ' + chalk.bold(projectId) + '. Check spelling and try again.', {
      exit: 1
    }));
  });
};
