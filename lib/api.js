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
var commandScopes;
var scopes = require('./scopes');

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
          exit: 2
        }));
      } else if (_.has(body, 'error')) {
        return reject(responseToError(response, body));
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
    path += _.includes(path, '?') ? '&' : '?';
    path += querystring.stringify(data);
  }
  return path;
};

var api = {
  // "In this context, the client secret is obviously not treated as a secret"
  // https://developers.google.com/identity/protocols/OAuth2InstalledApp
  clientId: utils.envOverride('FIREBASE_CLIENT_ID', '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'),
  clientSecret: utils.envOverride('FIREBASE_CLIENT_SECRET', 'j9iVZfS8kkCEFUPaAeJV0sAi'),
  adminOrigin: utils.envOverride('FIREBASE_ADMIN_URL', 'https://admin.firebase.com'),
  authOrigin: utils.envOverride('FIREBASE_AUTH_URL', 'https://accounts.google.com'),
  consoleOrigin: utils.envOverride('FIREBASE_CONSOLE_URL', 'https://console.firebase.google.com'),
  deployOrigin: utils.envOverride('FIREBASE_DEPLOY_URL', utils.envOverride('FIREBASE_UPLOAD_URL', 'https://deploy.firebase.com')),
  hostingOrigin: utils.envOverride('FIREBASE_HOSTING_URL', 'https://firebaseapp.com'),
  realtimeOrigin: utils.envOverride('FIREBASE_REALTIME_URL', 'https://firebaseio.com'),
  rulesOrigin: utils.envOverride('FIREBASE_RULES_URL', 'https://firebaserules.googleapis.com'),
  tokenOrigin: utils.envOverride('FIREBASE_TOKEN_URL', 'https://www.googleapis.com'),
  billingOrigin: utils.envOverride('FIREBASE_BILLING_URL', 'https://cloudbilling.googleapis.com'),

  setToken: function(token) {
    refreshToken = token;
  },
  setScopes: function(s) {
    commandScopes = _.uniq(_.flatten([
      scopes.EMAIL,
      scopes.OPENID,
      scopes.CLOUD_PROJECTS_READONLY,
      scopes.FIREBASE_PLATFORM
    ].concat(s || [])));
    logger.debug('> command requires scopes:', JSON.stringify(commandScopes));
  },
  getAccessToken: function() {
    return require('./auth').getAccessToken(refreshToken, commandScopes);
  },
  request: function(method, resource, options) {
    options = _.extend({
      data: {},
      origin: api.adminOrigin // default to hitting the admin backend
    }, options);

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'];

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

      return auth.getAccessToken(refreshToken, commandScopes).then(function(result) {
        reqOptions.headers = {
          authorization: 'Bearer ' + result.access_token
        };
        return _request(reqOptions);
      });
    }

    return _request(reqOptions);
  },
  getProject: function(projectId) {
    return api.request('GET', '/v1/projects/' + encodeURIComponent(projectId), {
      auth: true
    }).then(function(res) {
      if (res.body && !res.body.error) {
        return res.body;
      }

      return RSVP.reject(new FirebaseError('Server Error: Unexpected Response. Please try again', {
        context: res,
        exit: 2
      }));
    });
  },
  getProjects: function() {
    return api.request('GET', '/v1/projects', {
      auth: true
    }).then(function(res) {
      if (res.body && res.body.projects) {
        return res.body.projects;
      }

      return RSVP.reject(new FirebaseError('Server Error: Unexpected Response. Please try again', {
        context: res,
        exit: 2
      }));
    });
  },
  getSecret: function(instance, adminToken) {
    return api.request('GET', '/.settings/secrets.json', {
      origin: utils.addSubdomain(api.realtimeOrigin, instance),
      query: {auth: adminToken}
    }).then(function(response) {
      return response.body[0];
    });
  }
};

module.exports = api;
