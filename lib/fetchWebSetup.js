'use strict';

var getProjectId = require('./getProjectId');
var api = require('./api');

module.exports = function(options) {
  var projectId = getProjectId(options);
  return api.request('GET', '/v1/projects/' + projectId, {
    auth: true,
    origin: api.resourceManagerOrigin
  }).then(function(response) {
    return api.request('GET', '/v1/projects/' + response.body.projectNumber + '/clients/_:getWebAppConfig', {
      auth: true,
      origin: api.firedataOrigin
    });
  }).then(function(response) {
    return response.body;
  });
};
