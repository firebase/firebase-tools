'use strict';

var getProjectId = require('./getProjectId');
var api = require('./api');
var RSVP = require('rsvp');

module.exports = function(options) {
  if (options.projectNumber) {
    return RSVP.resolve(options.projectNumber);
  }
  var projectId = getProjectId(options);
  return api.request('GET', '/v1/projects/' + projectId, {
    auth: true,
    origin: api.resourceManagerOrigin
  }).then(function(response) {
    options.projectNumber = response.body.projectNumber;
    return options.projectNumber;
  });
};
