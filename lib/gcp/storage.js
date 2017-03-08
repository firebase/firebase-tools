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

// helper functions for creating staging buckets, delete later-----------
function _getOperation(operation) {
  return api.request('GET', '/v1/' + operation, {
    auth: true,
    origin: api.appengineOrigin
  });
}

function _pollOperation(operation) {
  var POLL_INTERVAL = 500; // 0.5 second
  return new RSVP.Promise(function(resolve) {
    setTimeout(function() { resolve(); }, POLL_INTERVAL);
  }).then(function() {
    return _getOperation(operation).then(function(res) {
      if (res.body.done) {
        return true;
      }
      return _pollOperation(operation);
    });
  });
}
// end of helper functions for creating staging buckets-------------------

function _getBucket(bucket) {
  return api.request('GET', '/storage/' + version + '/b/' + bucket, {
    auth: true,
    origin: api.googleOrigin
  });
}

function _createBucket(projectId) {
  // var bucket = _functionsBucketName(projectId);
  // return api.request('POST', '/storage/' + version + '/b?project=' + projectId, {
  //   auth: true,
  //   data: {
  //     name: bucket
  //   },
  //   origin: api.googleOrigin
  return api.request('POST', '/v1/apps/' + projectId + ':repair', {
    auth: true,
    origin: api.appengineOrigin
  }).then(function(resp) {
    return _pollOperation(resp.body.name);
  }).catch(function(err) {
    logger.info('\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.');
    return RSVP.reject(err);
  });
}

function _getOrCreateBucket(projectId, bucketName) {
  return _getBucket(bucketName).catch(function(err) {
    if (err.context.response.statusCode === 404) {
      logger.debug('creating bucket ' + bucketName + '...');
      return _createBucket(projectId);
    }
    return RSVP.reject(err);
  }).then(function() {
    return RSVP.resolve(bucketName);
  });
}

function _uploadSource(source, bucket) {
  var resource = ['b', bucket, 'o'].join('/');
  var endpoint = '/upload/storage/' + version + '/' + resource + '?uploadType=media&name=' + module.exports.archiveName;
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

module.exports = {
  archiveName: 'firebase-functions-source',
  buckets: {
    get: _getBucket,
    acquire: _getOrCreateBucket,
    getDefault: _getDefaultBucket
  },
  upload: _uploadSource
};
