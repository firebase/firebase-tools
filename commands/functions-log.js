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

var POLL_INTERVAL = 2000; // 5 sec


function _pollLogs(authClient, projectId, filter, insertId) {
  return new RSVP.Promise(function(resolve, reject) {
    function poll() {
      var nf = filter;
      if (insertId !== '') {
         nf += ' insertId>"' + insertId + '" '
      }
      // logger.info('>>> ---', nf)
      var promisedEntries = gcp.cloudlogging.entries(authClient, projectId, nf, 35, 'asc');
      RSVP.all([promisedEntries]).then(function(entries) {
        for (var i = 0; i < _.size(entries[0]); i++) {
          var entry = entries[0][i];
          logger.info(
            entry.timestamp,
            entry.severity.substring(0, 1),
            entry.resource.labels.function_name + ':',
            entry.textPayload);
          insertId = entry.insertId
        }
      }).catch(function(err) {
        return reject(err);
      });
      setTimeout(poll, POLL_INTERVAL);
    }
    poll();
  });
}

module.exports = new Command('functions:log')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .option('-F, --function <function_name>', 'specify function name whose logs will be fetched')
  .option('-n, --lines <num_lines>', 'specify number of log lines to fetch')
  .option('-f, --follow', 'tail logs from GCF cluster')
  .before(requireConfig)
  .before(requireAccess)
  .action(function(options) {
    var filter = 'resource.type="cloud_function" ' +
                 'labels."cloudfunctions.googleapis.com/region"="us-central1" ';
    if (options.function) {
      filter += 'labels."cloudfunctions.googleapis.com/function_name"="' + options.function + '" ';
    }
    var projectId = getProjectId(options);
    var authClient;
    return api.getAccessToken().then(function(result) {
      return gcp.createClient(result.access_token);
    }).then(function(client) {
      authClient = client;
      return gcp.cloudlogging.entries(authClient, projectId, filter, options.lines || 35, 'desc');
    }).then(function(entries) {
      for (var i = _.size(entries); i-- > 0;) {
        var entry = entries[i];
        logger.info(
          entry.timestamp,
          entry.severity.substring(0, 1),
          entry.resource.labels.function_name + ':',
          entry.textPayload);
      }
      if (options.follow) {
        return _pollLogs(authClient, projectId, filter, _.isEmpty(entries) ? '' : _.last(entries).insertId)
      } else if (_.isEmpty(entries)) {
        logger.info('No log entries found.');
      }
      return RSVP.resolve(entries);
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message, {exit: 1}));
    });
  });
