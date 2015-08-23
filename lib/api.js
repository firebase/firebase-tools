'use strict';

var request = require('request');
var url = require('url');
var querystring = require('querystring');
var FirebaseError = require('./error');
var RSVP = require('rsvp');
var _ = require('lodash');
var logger = require('./logger');

var _request = function(options) {
  logger.debug('>>> HTTP REQUEST',
    options.method,
    options.url.replace(/token=[^&]+/g, 'token=XXX'),
    options.body || ''
  );
  return new RSVP.Promise(function(resolve, reject) {
    request(options, function(err, response, body) {
      if (err) {
        return reject(new FirebaseError('Server Error', {
          original: err,
          context: {
            requestOptions: options
          },
          exit: 2
        }));
      } else if (body.error && body.error.message) {
        var exitCode;
        if (response.statusCode >= 500) {
          // 5xx errors are unexpected
          exitCode = 2;
        } else {
          // 4xx errors happen sometimes
          exitCode = 1;
        }

        return reject(new FirebaseError(body.error.message, {
          context: {
            requestOptions: options,
            body: body,
            response: response
          },
          exit: exitCode
        }));
      }

      logger.debug('<<< HTTP RESPONSE', response.statusCode, response.headers, body);
      return resolve({
        status: response.statusCode,
        response: response,
        body: body
      });
    });
  });
};

var _appendQueryData = function(path, data) {
  if (data && _.size(data) > 0) {
    path += _.contains(url, '?') ? '&' : '?';
    path += querystring.stringify(data);
  }
  return path;
};

var api = {
  realtimeUrl: 'https://firebaseio.com',
  adminUrl: 'https://admin.firebase.com',
  uploadUrl: 'https://hosting.firebase.com',
  hostingUrl: 'https://firebaseapp.com',
  request: function(method, resource, data, authenticate) {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    var auth = require('./auth');

    if ((typeof data === 'undefined') || !data) {
      data = {};
    }

    if ((typeof authenticate !== 'undefined') && (authenticate)) {
      resource = _appendQueryData(resource, {token: auth.token});
    }

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE'];

    if (validMethods.indexOf(method) < 0) {
      method = 'GET';
    }

    var options = {
      method: method,
      json: true
    };

    if (method === 'GET') {
      resource = _appendQueryData(resource, data);
    } else if (_.size(data) > 0) {
      options.body = data;
    }

    options.url = this.adminUrl + resource;
    return _request(options);
  },
  setRules: function(firebase, rules, authToken) {
    return _request({
      url: api.realtimeUrl.replace(/\/\//, '//' + firebase + '.') + '/.settings/rules.json?auth=' + authToken,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: rules
    });
  },
  getFirebases: function() {
    return api.request('GET', '/account', {}, true).then(function(res) {
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

function possiblyOverride(apiVariable, envVariable) {
  if (typeof process.env[envVariable] !== 'undefined') {
    var urlParts = null;
    try {
      urlParts = url.parse(process.env[envVariable]);
    } catch (err) {
      urlParts = null;
    }

    if (urlParts) {
      api[apiVariable] = process.env[envVariable];
    }
  }
}

possiblyOverride('adminUrl', 'FIREBASE_ADMIN_URL');
possiblyOverride('hostingUrl', 'FIREBASE_HOSTING_URL');
possiblyOverride('realtimeUrl', 'FIREBASE_REALTIME_URL');
possiblyOverride('uploadUrl', 'FIREBASE_UPLOAD_URL');

module.exports = api;
