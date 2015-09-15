'use strict';

var request = require('request');
var querystring = require('querystring');
var FirebaseError = require('./error');
var RSVP = require('rsvp');
var _ = require('lodash');
var logger = require('./logger');
var utils = require('./utils');

var _request = function(options) {
  logger.debug('>>> HTTP REQUEST',
    options.method,
    options.url.replace(/token=[^&]+/g, 'token=XXX'),
    options.body || ''
  );

  return new RSVP.Promise(function(resolve, reject) {
    var req = request(options, function(err, response, body) {
      if (err) {
        return reject(new FirebaseError('Server Error', {
          original: err,
          context: {
            requestOptions: options
          },
          exit: 2
        }));
      } else if (body.error) {
        var message = body.error.message || body.error;

        var exitCode;
        if (response.statusCode >= 500) {
          // 5xx errors are unexpected
          exitCode = 2;
        } else {
          // 4xx errors happen sometimes
          exitCode = 1;
        }

        return reject(new FirebaseError(message, {
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
  realtimeOrigin: utils.envOverride('FIREBASE_REALTIME_URL', 'https://firebaseio.com'),
  adminOrigin: utils.envOverride('FIREBASE_ADMIN_URL', 'https://admin.firebase.com'),
  uploadOrigin: utils.envOverride('FIREBASE_UPLOAD_URL', 'https://hosting.firebase.com'),
  hostingOrigin: utils.envOverride('FIREBASE_HOSTING_URL', 'https://firebaseapp.com'),
  websiteOrigin: utils.envOverride('FIREBASE_WEBSITE_URL', 'https://www.firebase.com'),

  request: function(method, resource, options) {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    var auth = require('./auth');
    options = _.extend({
      data: {},
      origin: api.adminOrigin // default to hitting the admin backend
    }, options);

    if (options.auth === true) {
      resource = _appendQueryData(resource, {token: auth.token});
    }

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
    } else if (_.size(options.data) > 0) {
      reqOptions.body = options.data;
    }

    reqOptions.url = options.origin + resource;
    reqOptions.files = options.files;
    return _request(reqOptions);
  },
  setRules: function(firebase, rules, authToken) {
    return _request({
      url: api.realtimeOrigin.replace(/\/\//, '//' + firebase + '.') + '/.settings/rules.json?auth=' + authToken,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: rules
    });
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
