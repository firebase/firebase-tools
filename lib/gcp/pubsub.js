'use strict';

var _ = require('lodash');
var api = require('../api');
var RSVP = require('rsvp');
var logger = require('../logger');

var version = 'v1';

function _topic(projectId, topicName) {
  return 'projects/' + projectId + '/topics/' + topicName;
}

function _createTopic(projectId, topicName) {
  var topic = _topic(projectId, topicName);

  return api.request('PUT', '/' + version + '/' + topic, {
    auth: true,
    data: {
      name: topic
    },
    origin: api.pubsubOrigin
  }).then(function(res) {
    var topicPath = res.body.name;
    return RSVP.resolve(topicPath);
  }, function(err) {
    logger.debug('[functions] failed to create topic: ' + err.message);
    return RSVP.reject(err.message);
  });
}

function _getTopicExists(projectId, topicName) {
  var topic = _topic(projectId, topicName);

  return api.request('GET', '/' + version + '/' + topic, {
    auth: true,
    origin: api.pubsubOrigin
  }).then(function(res) {
    var topicPath = res.body.name;
    return RSVP.resolve(topicPath);
  });
}

function _deleteTopic(projectId, topicName) {
  var topic = _topic(projectId, topicName);

  return api.request('DELETE', '/' + version + '/' + topic, {
    auth: true,
    origin: api.pubsubOrigin
  }).catch(function(err) {
    logger.debug.logWarning('[functions] failed to delete topic: ' + err.message);
    return RSVP.reject(err.message);
  });
}

function _getOrCreateTopic(projectId, topicName) {
  return _getTopicExists(projectId, topicName).catch(function(err) {
    if (err.context.response.statusCode === 404) {
      logger.debug('[functions] topic ' + topicName + ' does not exist, creating ...');
      return _createTopic(projectId, topicName);
    }
    return RSVP.reject(err.message);
  });
}

function _addPublisher(projectId, topicName, serviceAccount) {
  var topic = _topic(projectId, topicName);

  return api.request('GET', '/' + version + '/' + topic + ':getIamPolicy', {
    auth: true,
    origin: api.pubsubOrigin
  }).then(function(resp) {
    var role = _.find(resp.body.bindings, { role: 'roles/pubsub.publisher' });
    if (role) {
      // find and add if absent
      role.members = _.union(role.members, [ 'serviceAccount:' + serviceAccount ]);
    } else {
      // add new role
      role =   {
        role: 'roles/pubsub.publisher',
        members: [ 'serviceAccount:' + serviceAccount ]
      };
      resp.body.bindings = resp.body.bindings || [];
      resp.body.bindings.push(role);
    }
    return api.request('POST', '/' + version + '/' + topic + ':setIamPolicy', {
      auth: true,
      data: {
        policy: {
          version: '1',
          bindings: resp.body.bindings
        }
      },
      rejectOnHTTPError: true,
      origin: api.pubsubOrigin
    });
  }).catch(function(err) {
    var method = err.context.requestOptions.method;
    if (method === 'GET') {
      logger.debug('[functions] failed to get IAM for topic: ' + topic);
      logger.debug(err.message);
    } else if (method === 'POST') {
      logger.debug('[functions] failed to set IAM for topic: ' + topic);
      logger.debug(err.message);
    } else {
      logger.debug('[functions] unexpected server error for topic: ' + topic);
    }
    return RSVP.reject(err.message);
  });
}

module.exports = {
  topics: {
    create: _createTopic,
    exists: _getTopicExists,
    delete: _deleteTopic,
    acquire: _getOrCreateTopic,
    addPublisher: _addPublisher
  }
};
