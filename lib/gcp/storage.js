'use strict';

var RSVP = require('rsvp');
var api = require('../api');
var logger = require('../logger');
var FirebaseError = require('../error');

var version = 'v1';

function _getDefaultBucket(projectId) {
  return api.request('GET', '/v1/apps/' + projectId, {
    auth: true,
    origin: api.appengineOrigin
  }).then(function(resp) {
    if (resp.body.defaultBucket === 'undefined') {
      logger.debug('Default storage bucket is undefined.');
      return RSVP.reject(new FirebaseError('Your project is being set up. Please wait a minute before deploying again.'));
    }
    return RSVP.resolve(resp.body.defaultBucket);
  }, function(err) {
    logger.info('\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.');
    return RSVP.reject(err);
  });
}

function _getBucket(bucket) {
  return api.request('GET', '/storage/' + version + '/b/' + bucket, {
    auth: true,
    origin: api.googleOrigin
  });
}

function _getUploadUrl(projectId, location) {
  var parent = 'projects/' + projectId + '/locations/' + location;
  return api.request('POST', '/v1/' + parent + '/functions:generateUploadUrl', {
    auth: true,
    json: false,
    origin: api.functionsOrigin
  }).then(function(result) {
    var responseBody = JSON.parse(result.body);
    return RSVP.resolve(responseBody.uploadUrl);
  }, function(err) {
    logger.info('\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.');
    return RSVP.reject(err);
  });
}

function _uploadSource(source, uploadUrl) {
  return api.request('PUT', uploadUrl, {
    data: source.stream,
    headers: {
      'Content-Type': 'application/zip',
      'x-goog-content-length-range': '0,104857600'
    },
    json: false,
    origin: api.storageOrigin
  });
}

module.exports = {
  archiveName: 'firebase-functions-source',
  buckets: {
    get: _getBucket,
    getDefault: _getDefaultBucket
  },
  getUploadUrl: _getUploadUrl,
  upload: _uploadSource
};
