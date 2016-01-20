'use strict';

var RSVP = require('rsvp');
var google = require('googleapis');
var cloudlogging = google.logging('v2beta1');
var logger = require('../logger');

module.exports = {
  entries: function(authClient, projectId, filter, pageSize) {
    return new RSVP.Promise(function(resolve, reject) {
      cloudlogging.entries.list({
        resource: {
          projectIds: [projectId],
          pageSize: pageSize,
          orderBy: 'timestamp desc',
          filter: filter
        },
        auth: authClient
      }, function(err, result) {
        if (err) {
          logger.warn('Failed to list log entries.', {
            error: err.message
          });
          return reject(err);
        }
        return resolve(result.entries || {});
      });
    });
  }
};
