'use strict';

var api = require('../api');
var _ = require('lodash');
var RSVP = require('rsvp');
var logger = require('../logger');

var version = 'v1';

function _getKeys(projectId) {
  return api.request('GET', '/' + version + '/projects/' + projectId + '/apiKeys', {
    auth: true,
    origin: api.apikeysOrigin
  }).then(function(res) {
    return res.body.keys;
  });
}

function _getServerKey(projectId) {
  return _getKeys(projectId).then(function(keys) {
    var filter = function(elem) {
      return /[Ss]erver/.test(elem.displayName);
    };
    return _.chain(keys).find(filter).get('currentKey').value();
  }).catch(function(err) {
    logger.debug('Error fetching server API key: ', err);
    return RSVP.resolve(null);
  });
}

module.exports = {
  getServerKey: _getServerKey
};
