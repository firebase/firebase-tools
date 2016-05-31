'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var fs = require('fs');
var jwt = require('jsonwebtoken');
var http = require('http');
var open = require('open');
var path = require('path');
var portfinder = require('portfinder');
var RSVP = require('rsvp');
var url = require('url');

var api = require('./api');
var configstore = require('./configstore');
var FirebaseError = require('./error');
var logger = require('./logger');
var previews = require('./previews');
var prompt = require('./prompt');
var scopes = require('./scopes');

portfinder.basePort = 9005;

var FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
var SCOPES = [
  scopes.EMAIL,
  scopes.OPENID,
  scopes.CLOUD_PROJECTS_READONLY,
  scopes.FIREBASE_PLATFORM
];

if (previews.functions) {
  SCOPES.push(scopes.CLOUD_PLATFORM);
}

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
  return api.authOrigin + '/o/oauth2/auth?' + _.map({
    client_id: api.clientId,
    scope: SCOPES.join(' '),
    response_type: 'code',
    state: _nonce,
    redirect_uri: callbackUrl
  }, function(v, k) {
    return k + '=' + encodeURIComponent(v);
  }).join('&');
};

var _getTokensFromAuthorizationCode = function(code, callbackUrl) {
  return api.request('POST', '/o/oauth2/token', {
    origin: api.authOrigin,
    form: {
      code: code,
      client_id: api.clientId,
      client_secret: api.clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code'
    }
  }).then(function(res) {
    if (!_.has(res, 'body.access_token') && !_.has(res, 'body.refresh_token')) {
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

var _respondWithFile = function(req, res, statusCode, filename) {
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

var _loginWithoutLocalhost = function() {
  var callbackUrl = _getCallbackUrl();
  var authUrl = _getLoginUrl(callbackUrl);

  logger.info();
  logger.info('Visit this URL on any device to log in:');
  logger.info(chalk.bold.underline(authUrl));
  logger.info();

  open(authUrl);

  return prompt({}, [{
    type: 'input',
    name: 'code',
    message: 'Paste authorization code here:'
  }]).then(function(answers) {
    return _getTokensFromAuthorizationCode(answers.code, callbackUrl);
  }).then(function(tokens) {
    return {
      user: jwt.decode(tokens.id_token),
      tokens: tokens,
      scopes: SCOPES
    };
  });
};

var _loginWithLocalhost = function(port) {
  return new RSVP.Promise(function(resolve, reject) {
    var callbackUrl = _getCallbackUrl(port);
    var authUrl = _getLoginUrl(callbackUrl);

    var server = http.createServer(function(req, res) {
      var tokens;
      var query = _.get(url.parse(req.url, true), 'query', {});

      if (query.state === _nonce && _.isString(query.code)) {
        return _getTokensFromAuthorizationCode(query.code, callbackUrl)
          .then(function(result) {
            tokens = result;
            return _respondWithFile(req, res, 200, '../templates/loginSuccess.html');
          }).then(function() {
            server.close();
            return resolve({
              user: jwt.decode(tokens.id_token),
              tokens: tokens
            });
          }).catch(function() {
            return _respondWithFile(req, res, 400, '../templates/loginFailure.html');
          });
      }
      _respondWithFile(req, res, 400, '../templates/loginFailure.html');
    });

    server.listen(port, function() {
      logger.info();
      logger.info('Visit this URL on any device to log in:');
      logger.info(chalk.bold.underline(authUrl));
      logger.info();
      logger.info('Waiting for authentication...');

      open(authUrl);
    });

    server.on('error', function() {
      _loginWithoutLocalhost().then(resolve, reject);
    });
  });
};

var login = function(localhost) {
  if (localhost) {
    return _getPort().then(_loginWithLocalhost, _loginWithoutLocalhost);
  }
  return _loginWithoutLocalhost();
};

var _haveValidAccessToken = function(refreshToken, authScopes) {
  if (_.isEmpty(lastAccessToken)) {
    var tokens = configstore.get('tokens');
    if (refreshToken === _.get(tokens, 'refresh_token')) {
      lastAccessToken = tokens;
    }
  }

  return _.has(lastAccessToken, 'access_token') &&
    lastAccessToken.refresh_token === refreshToken &&
    // verify that the exact same scopes are being used for this request
    _.isEqual(authScopes.sort(), (lastAccessToken.scopes || []).sort()) &&
    _.has(lastAccessToken, 'expires_at') &&
    lastAccessToken.expires_at > Date.now() + FIFTEEN_MINUTES_IN_MS;
};

var _logoutCurrentSession = function(refreshToken) {
  var tokens = configstore.get('tokens');
  var currentToken = _.get(tokens, 'refresh_token');
  if (refreshToken === currentToken) {
    configstore.del('user');
    configstore.del('tokens');
    configstore.del('usage');
    configstore.del('analytics-uuid');
  }
};

var _refreshAccessToken = function(refreshToken, authScopes) {
  logger.debug('> refreshing access token with scopes:', JSON.stringify(authScopes));
  return api.request('POST', '/oauth2/v3/token', {
    origin: api.tokenOrigin,
    form: {
      refresh_token: refreshToken,
      client_id: api.clientId,
      client_secret: api.clientSecret,
      grant_type: 'refresh_token',
      scope: (authScopes || []).join(' ')
    }
  }).then(function(res) {
    if (!_.isString(res.body.access_token)) {
      throw new FirebaseError('Authentication Error.', {
        exit: 1
      });
    }
    lastAccessToken = _.assign({
      expires_at: Date.now() + res.body.expires_in * 1000,
      refresh_token: refreshToken,
      scopes: authScopes
    }, res.body);

    var currentRefreshToken = _.get(configstore.get('tokens'), 'refresh_token');
    if (refreshToken === currentRefreshToken) {
      configstore.set('tokens', lastAccessToken);
    }

    return lastAccessToken;
  }, function(err) {
    if (err.message === 'invalid_grant') {
      _logoutCurrentSession(refreshToken);
      throw new FirebaseError('Your refresh token has been revoked, please run ' +
          chalk.bold('firebase login') + ' to obtain a new one.', {
            exit: 1
          });
    }
    throw new FirebaseError('Authentication Error.', {
      exit: 1
    });
  });
};

var getAccessToken = function(refreshToken, authScopes) {
  if (_haveValidAccessToken(refreshToken, authScopes)) {
    return RSVP.resolve(lastAccessToken);
  }
  return _refreshAccessToken(refreshToken, authScopes);
};

var logout = function(refreshToken) {
  if (lastAccessToken.refresh_token === refreshToken) {
    lastAccessToken = {};
  }
  _logoutCurrentSession(refreshToken);
  return api.request('GET', '/o/oauth2/revoke', {
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
