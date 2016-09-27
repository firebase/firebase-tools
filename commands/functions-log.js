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
var open = require('open');

module.exports = new Command('functions:log')
  .description('read logs from deployed functions')
  .option('--only <function_names>', 'only show logs of specified, comma-seperated functions (e.g. "funcA,funcB")')
  .option('-n, --lines <num_lines>', 'specify number of log lines to fetch')
  .option('--open', 'open logs page in web browser')
  .before(requireAccess, [scopes.OPENID, scopes.CLOUD_PLATFORM])
  .action(function(options) {
    var projectId = getProjectId(options);
    var apiFilter = 'resource.type="cloud_function" ';
    var consoleFilter = 'metadata.serviceName:"cloudfunctions.googleapis.com"';
    if (options.only) {
      var funcNames = options.only.split(',');
      var apiFuncFilters = _.map(funcNames, function(funcName) {
        return 'resource.labels.function_name="' + funcName + '" ';
      });
      var consoleFuncFilters = _.map(funcNames, function(funcName) {
        return 'metadata.labels."cloudfunctions.googleapis.com/function_name":"' + funcName + '" ';
      });
      apiFilter += apiFuncFilters.join('OR ');
      consoleFilter = [consoleFilter, consoleFuncFilters.join('%20OR%20')].join('%0A');
    }
    if (options.open) {
      var url = 'https://console.developers.google.com/logs/viewer?advancedFilter=' + consoleFilter + '&project=' + projectId;
      open(url);
      return RSVP.resolve();
    }
    return gcp.cloudlogging.listEntries(projectId, apiFilter, options.lines || 35, 'desc')
    .then(function(entries) {
      for (var i = _.size(entries); i-- > 0;) {
        var entry = entries[i];
        logger.info(
          entry.timestamp,
          entry.severity.substring(0, 1),
          entry.resource.labels.function_name + ':',
          entry.textPayload);
      }
      if (_.isEmpty(entries)) {
        logger.info('No log entries found.');
      }
      return RSVP.resolve(entries);
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError(
        'Failed to list log entries ' + err.message, {exit: 1}));
    });
  });
