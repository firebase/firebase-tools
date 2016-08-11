'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var gcp = require('../lib/gcp');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');

var POLL_INTERVAL = 3000; // 3 sec

function _pollLogs(projectId, filter, pos) {
  return new RSVP.Promise(function(resolve, reject) {
    function poll() {
      var nf = filter;
      if (pos.timestamp) {
        nf += ' timestamp>"' + pos.timestamp + '" ';
      }
      if (pos.insertId) {
        nf += ' insertId>"' + pos.insertId + '" ';
      }

      gcp.cloudlogging.listEntries(projectId, nf, 1000, 'asc').then(function(entries) {
        for (var i = 0; i < _.size(entries); i++) {
          var entry = entries[i];
          logger.info(
            entry.timestamp,
            entry.severity.substring(0, 1),
            entry.resource.labels.function_name + ':',
            entry.textPayload);
          pos.timestamp = entry.timestamp;
          pos.insertId = entry.insertId;
        }
        setTimeout(poll, POLL_INTERVAL);
      }).catch(function(err) {
        return reject(err);
      });
    }
    poll();
  });
}

module.exports = new Command('functions:log')
  .description('read logs from deployed functions')
  .option('--only <function_names>', 'only show logs of specified, comma-seperated functions (e.g. "funcA,funcB")')
  .option('-n, --lines <num_lines>', 'specify number of log lines to fetch')
  .option('-f, --follow', 'stream logs from GCF cluster')
  .before(requireAccess, [scopes.OPENID, scopes.CLOUD_PLATFORM])
  .action(function(options) {
    var filter = 'resource.type="cloud_function" ';
    if (options.only) {
      var funcNames = options.only.split(',');
      var funcFilters = _.map(funcNames, function(funcName) {
        return 'resource.labels.function_name="' + funcName + '" ';
      });
      filter += funcFilters.join('OR ');
    }
    var projectId = getProjectId(options);
    return gcp.cloudlogging.listEntries(projectId, filter, options.lines || 35, 'desc')
    .then(function(entries) {
      for (var i = _.size(entries); i-- > 0;) {
        var entry = entries[i];
        logger.info(
          entry.timestamp,
          entry.severity.substring(0, 1),
          entry.resource.labels.function_name + ':',
          entry.textPayload);
      }
      if (options.follow) {
        var pos = {};
        if (!_.isEmpty(entries)) {
          var lastEntry = _.first(entries);
          pos = {
            timestamp: lastEntry.timestamp,
            insertId: lastEntry.insertId
          };
        }
        return _pollLogs(projectId, filter, pos);
      } else if (_.isEmpty(entries)) {
        logger.info('No log entries found.');
      }
      return RSVP.resolve(entries);
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message, {exit: 1}));
    });
  });
