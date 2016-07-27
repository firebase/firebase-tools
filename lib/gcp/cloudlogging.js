'use strict';

var RSVP = require('rsvp');
var api = require('../api');

var version = 'v2beta1';

var _listEntries = function(projectId, filter, pageSize, order) {
  return api.request('POST', '/' + version + '/entries:list', {
    auth: true,
    data: {
      projectIds: [projectId],
      filter: filter,
      orderBy: 'timestamp ' + order,
      pageSize: pageSize
    },
    origin: api.cloudloggingOrigin
  }).then(function(result) {
    return RSVP.resolve(result.body.entries);
  });
};

module.exports = {
  listEntries: _listEntries
};
