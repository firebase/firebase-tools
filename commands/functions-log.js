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

module.exports = new Command('functions:log')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .option('-f, --function <function_name>', 'specify function name whose logs will be fetched')
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
      var filter = 'resource.type="cloud_function" labels."cloudfunctions.googleapis.com/region"="us-central1"'
      if (options.function) {
        filter += ' labels."cloudfunctions.googleapis.com/function_name"="'+ options.function +'"'
      }
      return gcp.cloudlogging.entries(authClient, projectId, filter, options.lines || 35);
    }).then(function(entries) {
      if ( _.isEmpty(entries)) {
        logger.info('No log entries found.')
      } else {
        _.forEach(entries, function(entry, id) {
          var __ = ' '
          logger.info(
            entry.timestamp, __,
            entry.severity.substring(0,1), __,
            entry.resource.labels.function_name + ':', __,
            entry.textPayload);
        });
      }
      return RSVP.resolve(entries);
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message , {exit: 1}));
    });
  });
