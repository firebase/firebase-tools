'use strict';

var _ = require('lodash');
var fs = require('fs');
var api = require('./api');
var jwt = require('jsonwebtoken');
var url = require('url');
var http = require('http');
var open = require('open');
var path = require('path');
var RSVP = require('rsvp');
var chalk = require('chalk');
var logger = require('../lib/logger');
var prompt = require('./prompt');
var portfinder = require('portfinder');
var configstore = require('./configstore');
var FirebaseError = require('./error');

var FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

var _nonce = _.random(1, 2 << 29).toString();
var _getPort = RSVP.denodeify(portfinder.getPort);

// in-memory cache, so we have it for successive calls
var lastAccessToken = {};

var _getCallbackUrl = function(port) {
  if (_.isUndefined(port)) {
    return 'urn:ietf:wg:oauth:2.0:oob';
  }
  return 'http://localhost:' + port;
};

var _getLoginUrl = function(callbackUrl) {
  return api.authOrigin + api.authResource + '?' + _.map({
    client_id: api.clientId,
    scope: [
      'email',
      'openid',
      'https://www.googleapis.com/auth/cloud-platform'
    ].join(' '),
    response_type: 'code',
    state: _nonce,
    redirect_uri: callbackUrl
  }, function(v, k) {
    return k + '=' + encodeURIComponent(v);
  }).join('&');
};

var _getTokensFromAuthorizationCode = function(code, callbackUrl) {
  return api.request('POST', api.refreshTokenResource, {
    origin: api.authOrigin,
    form: {
      code: code,
      client_id: api.clientId,
      client_secret: api.clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code'
    }
  }).then(function(res) {
    if (!_.isString(res.body.access_token) && !_.isString(res.body.refresh_token)) {
      throw new FirebaseError('Authentication Error.', {
        exit: 1
      });
    }
    lastAccessToken = _.assign({
      expires_at: Date.now() + res.body.expires_in * 1000
    }, res.body);
    return lastAccessToken;
  }, function() {
    throw new FirebaseError('Authentication Error.', {
      exit: 1
    });
  });
};

var _loginWithoutLocalhost = function() {
  var callbackUrl = _getCallbackUrl();
  var authUrl = _getLoginUrl(callbackUrl);
  logger.info('Visit this URL on any device to log in:');
  logger.info(chalk.bold.underline(authUrl));
  logger.info();

  open(authUrl);

  return prompt({}, [{
    type: 'input',
    name: 'code',
    message: 'Paste authorization code here:'
  }]).then(function(answers) {
    return _getTokensFromAuthorizationCode(answers.code, callbackUrl)
      .then(function(tokens) {
        return {
          user: jwt.decode(tokens.id_token),
          tokens: tokens
        };
      });
  });
};

var _respondToHttp = function(req, res, statusCode, filename) {
  return new RSVP.Promise(function(resolve, reject) {
    fs.readFile(path.join(__dirname, filename), function(err, response) {
      if (err) {
        return reject(err);
      }
      res.writeHead(statusCode, {
        'Content-Length': response.length,
        'Content-Type': 'text/html'
      });
      res.end(response);
      req.socket.destroy();
      return resolve();
    });
  });
};

var _loginWithLocalhost = function(port) {
  return new RSVP.Promise(function(resolve, reject) {
    var callbackUrl = _getCallbackUrl(port);
    var authUrl = _getLoginUrl(callbackUrl);

    var server = http.createServer(function(req, res) {
      var query = _.get(url.parse(req.url, true), 'query', {});

      if (query.state === _nonce && _.isString(query.code)) {
        return _getTokensFromAuthorizationCode(query.code, callbackUrl)
          .then(function(tokens) {
            _respondToHttp(req, res, 200, '../templates/loginSuccess.html')
              .then(function() {
                server.close();
                return resolve({
                  user: jwt.decode(tokens.id_token),
                  tokens: tokens
                });
              });
          }, function() {
            _respondToHttp(req, res, 400, '../templates/loginFailure.html')
          });
      }
      _respondToHttp(req, res, 400, '../templates/loginFailure.html')
    });

    server.listen(port, function(err) {
      if (err) {
        return _loginWithoutLocalhost().then(resolve, reject);
      }
      logger.info('Visit this URL on any device to log in:');
      logger.info(chalk.bold.underline(authUrl));
      logger.info();
      logger.info('Waiting for authentication...');
      logger.info();

      open(authUrl);
    });
  });
};

var login = function(localhost) {
  if (localhost) {
    return _getPort().then(_loginWithLocalhost, _loginWithoutLocalhost);
  }
  return _loginWithoutLocalhost();
};

var _haveValidAccessToken = function(refreshToken) {
  if (_.isEmpty(lastAccessToken)) {
    var tokens = configstore.get('tokens');
    if (refreshToken === _.get(tokens, 'refresh_token')) {
      lastAccessToken = tokens;
    }
  }
  return _.has(lastAccessToken, 'access_token') &&
    lastAccessToken.refresh_token === refreshToken &&
    _.has(lastAccessToken, 'expires_at') &&
    lastAccessToken.expires_at > Date.now() + FIVE_MINUTES_IN_MS;
};

var _refreshAccessToken = function(refreshToken) {
  return api.request('POST', api.accessTokenResource, {
    origin: api.tokenOrigin,
    form: {
      refresh_token: refreshToken,
      client_id: api.clientId,
      client_secret: api.clientSecret,
      grant_type: 'refresh_token'
    }
  }).then(function(res) {
    if (!_.isString(res.body.access_token)) {
      throw new FirebaseError('Authentication Error.', {
        exit: 1
      });
    }
    lastAccessToken = _.assign({
      expires_at: Date.now() + res.body.expires_in * 1000,
      refresh_token: refreshToken
    }, res.body);

    var currentRefreshToken = configstore.get('tokens').refresh_token;
    if (refreshToken === currentRefreshToken) {
      configstore.set('tokens', lastAccessToken);
    }

    return lastAccessToken;
  }, function() {
    throw new FirebaseError('Authentication Error.', {
      exit: 1
    });
  });
};

var getAccessToken = function(refreshToken) {
  if (_haveValidAccessToken(refreshToken)) {
    return RSVP.resolve(lastAccessToken);
  }
  return _refreshAccessToken(refreshToken);
};

var logout = function(refreshToken) {
  if (lastAccessToken.refresh_token === refreshToken) {
    lastAccessToken = {};
  }
  return api.request('GET', api.revokeResource, {
    origin: api.authOrigin,
    data: {
      token: refreshToken
    }
  }, function() {
    throw new FirebaseError('Authentication Error.', {
      exit: 1
    });
  });
};

var auth = {
  login: login,
  getAccessToken: getAccessToken,
  logout: logout
};

module.exports = auth;
