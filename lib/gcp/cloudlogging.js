'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var google = require('googleapis')
var cloudlogging = google.logging('v2beta1');
var logger = require('../logger');

module.exports = {
  entries: function(authClient, projectId) {
    return new RSVP.Promise(function(resolve, reject) {
      cloudlogging.entries.list({
        resource: {
          projectIds: [projectId],
          pageSize: 10,
          orderBy: 'timestamp desc'
        },
        auth: authClient
      }, function(err, result) {
        if (err) {
          logger.warn('Failed to list log entries.', {
            location: location,
            error: err.message
          });
          return reject(err);
        }
        return resolve(result.entries || {});
      });
    });
  }
};