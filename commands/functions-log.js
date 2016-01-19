'use strict';

var _ = require('lodash');
var api = require('../lib/api');
var chalk = require('chalk');
var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var gcp = require('../lib/gcp');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var RSVP = require('rsvp');
var sh = require('shelljs');
var utils = require('../lib/utils');

module.exports = new Command('functions:log [name]')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .before(requireConfig)
  .before(requireAccess)
  .action(function(name, options) {
    var projectId = getProjectId(options);
    var authClient;
    return api.getAccessToken().then(function(result) {
      return gcp.createClient(result.access_token);
    }).then(function(client) {
      authClient = client;
      return gcp.cloudlogging.entries(authClient, projectId);
    }).then(function(entries) {
      _.forEach(entries, function(entry, id) {
        logger.info(entry.textPayload);
      });
      return RSVP.resolve();
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message , {exit: 1}));
    });
  });
