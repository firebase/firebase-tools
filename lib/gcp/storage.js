'use strict';

var RSVP = require('rsvp');
var api = require('../api');
var logger = require('../logger');

var version = 'v1';

function _bucketName(projectId) {
  // Follow naming rules in
  // https://cloud.google.com/storage/docs/naming#requirements
  // (Replace colon and dot in G Suite accounts with dashes. Replace
  // disallowed "google" substring.)
  return projectId.replace(/[\.:]/g, '-').replace(/google/g, 'g00g1e') + '-gcf';
}

function _getBucket(projectId) {
  return api.request('GET', '/storage/' + version + '/b/' + _bucketName(projectId), {
    auth: true,
    origin: api.googleOrigin
  });
}

function _createBucket(projectId) {
  var bucket = _bucketName(projectId);
  return api.request('POST', '/storage/' + version + '/b?project=' + projectId, {
    auth: true,
    data: {
      name: bucket
    },
    origin: api.googleOrigin
  }).catch(function(err) {
    logger.debug('failed to create storage bucket ' + bucket + ': ' + err.message);
    return RSVP.reject(err);
  });
}

function _getOrCreateBucket(projectId) {
  return _getBucket(projectId).catch(function(err) {
    if (err.context.response.statusCode === 404) {
      logger.debug('creating bucket ' + _bucketName(projectId));
      return _createBucket(projectId);
    }
    return RSVP.reject(err);
  });
}

function _uploadSource(source, projectId) {
  var resource = ['b', _bucketName(projectId), 'o'].join('/');
  var endpoint = '/upload/storage/' + version + '/' + resource + '?uploadType=media&name=' + projectId;
  return api.request('POST', endpoint, {
    auth: true,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': source.size
    },
    data: source,
    json: false,
    origin: api.googleOrigin
  });
}

function _getDefaultBucket(projectId) {
  return api.request('GET', '/v1/apps/' + projectId, {
    auth: true,
    origin: api.appengineOrigin
  }).then(function(resp) {
    return RSVP.resolve(resp.body.defaultBucket);
  }, function(err) {
    logger.debug('Error fetching storage bucket name: ', err);
    return RSVP.resolve(null);
  });
}

module.exports = {
  buckets: {
    name: _bucketName,
    get: _getBucket,
    create: _createBucket,
    acquire: _getOrCreateBucket,
    getDefault: _getDefaultBucket
  },
  upload: _uploadSource
};
