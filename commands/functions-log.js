'use strict';

var _ = require('lodash');
var api = require('../lib/api');
var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var gcp = require('../lib/gcp');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var RSVP = require('rsvp');

module.exports = new Command('functions:log')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .option('-F, --function <function_name>', 'specify function name whose logs will be fetched')
  .option('-n, --lines <num_lines>', 'specify number of log lines to fetch')
  .before(requireConfig)
  .before(requireAccess)
  .action(function(options) {
    var projectId = getProjectId(options);
    var authClient;
    return api.getAccessToken().then(function(result) {
      return gcp.createClient(result.access_token);
    }).then(function(client) {
      authClient = client;
      var filter = 'resource.type="cloud_function" labels."cloudfunctions.googleapis.com/region"="us-central1"';
      if (options.function) {
        filter += ' labels."cloudfunctions.googleapis.com/function_name"="' + options.function + '"';
      }
      return gcp.cloudlogging.entries(authClient, projectId, filter, options.lines || 35);
    }).then(function(entries) {
      if ( _.isEmpty(entries)) {
        logger.info('No log entries found.');
      } else {
        for (var i = _.size(entries); i-- > 0;) {
          var entry = entries[i];
          logger.info(
            entry.timestamp,
            entry.severity.substring(0, 1),
            entry.resource.labels.function_name + ':',
            entry.textPayload);
        }
      }
      return RSVP.resolve(entries);
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message, {exit: 1}));
    });
  });
