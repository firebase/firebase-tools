'use strict';

var request = require('request');
var querystring = require('querystring');
var FirebaseError = require('./error');
var RSVP = require('rsvp');
var _ = require('lodash');
var logger = require('./logger');
var utils = require('./utils');
var responseToError = require('./responseToError');
var refreshToken;

var _request = function(options) {
  logger.debug('>>> HTTP REQUEST',
    options.method,
    options.url,
    options.body || options.form || ''
  );

  return new RSVP.Promise(function(resolve, reject) {
    var req = request(options, function(err, response, body) {
      if (err) {
        return reject(new FirebaseError('Server Error. Please try again in a few minutes.', {
          original: err,
          context: {
            requestOptions: options
          },
          exit: 2
        }));
      } else if (body.error) {
        return reject(responseToError(response, body, options));
      }

      logger.debug('<<< HTTP RESPONSE', response.statusCode, response.headers);
      if (response.statusCode >= 400) {
        logger.debug('<<< HTTP RESPONSE BODY', response.body);
      }

      return resolve({
        status: response.statusCode,
        response: response,
        body: body
      });
    });

    if (_.size(options.files) > 0) {
      var form = req.form();
      _.forEach(options.files, function(details, param) {
        form.append(param, details.stream, {
          knownLength: details.knownLength,
          filename: details.filename,
          contentType: details.contentType
        });
      });
    }
  });
};

var _appendQueryData = function(path, data) {
  if (data && _.size(data) > 0) {
    path += _.contains(path, '?') ? '&' : '?';
    path += querystring.stringify(data);
  }
  return path;
};

var api = {
  // "In this context, the client secret is obviously not treated as a secret"
  // https://developers.google.com/identity/protocols/OAuth2InstalledApp
  clientId: utils.envOverride('FIREBASE_CLIENT_ID', '913593569743-gi5pvq5c7caldllume04i29ednmj1usf.apps.googleusercontent.com'),
  clientSecret: utils.envOverride('FIREBASE_CLIENT_SECRET', 'LH4XAIwonyVUOjdzHj7lfSJI'),
  authOrigin: utils.envOverride('FIREBASE_AUTH_URL', 'https://accounts.google.com'),
  authResource: '/o/oauth2/auth',
  revokeResource: '/o/oauth2/revoke',
  refreshTokenResource: '/o/oauth2/token',
  tokenOrigin: utils.envOverride('FIREBASE_TOKEN_URL', 'https://www.googleapis.com'),
  accessTokenResource: '/oauth2/v3/token',
  realtimeOrigin: utils.envOverride('FIREBASE_REALTIME_URL', 'https://firebaseio.com'),
  adminOrigin: utils.envOverride('FIREBASE_ADMIN_URL', 'https://admin.firebase.com'),
  uploadOrigin: utils.envOverride('FIREBASE_DEPLOY_URL', utils.envOverride('FIREBASE_UPLOAD_URL', 'https://deploy.firebase.com')),
  hostingOrigin: utils.envOverride('FIREBASE_HOSTING_URL', 'https://firebaseapp.com'),
  websiteOrigin: utils.envOverride('FIREBASE_WEBSITE_URL', 'https://www.firebase.com'),
  setToken: function(token) {
    refreshToken = token;
  },
  request: function(method, resource, options) {
    options = _.extend({
      data: {},
      origin: api.adminOrigin // default to hitting the admin backend
    }, options);

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE'];

    if (validMethods.indexOf(method) < 0) {
      method = 'GET';
    }

    var reqOptions = {
      method: method,
      json: true
    };

    if (options.query) {
      resource = _appendQueryData(resource, options.query);
    }

    if (method === 'GET') {
      resource = _appendQueryData(resource, options.data);
    } else {
      if (_.size(options.data) > 0) {
        reqOptions.body = options.data;
      } else if (_.size(options.form) > 0) {
        reqOptions.form = options.form;
      }
    }

    reqOptions.url = options.origin + resource;
    reqOptions.files = options.files;

    if (options.auth === true) {
      // Runtime fetch of Auth singleton to prevent circular module dependencies
      var auth = require('./auth');

      return auth.getAccessToken(refreshToken).then(function(result) {
        reqOptions.headers = {
          authorization: 'Bearer ' + result.access_token
        };
        return _request(reqOptions);
      });
    }

    return _request(reqOptions);
  },
  getFirebases: function() {
    return api.request('GET', '/account', {
      auth: true
    }).then(function(res) {
      if (res.body && res.body.firebases) {
        return res.body.firebases;
      }

      return RSVP.reject(new FirebaseError('Server Error: Unexpected Response. Please try again', {
        context: res,
        exit: 2
      }));
    });
  }
};

module.exports = api;
