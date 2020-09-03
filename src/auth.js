"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var fs = require("fs");
var jwt = require("jsonwebtoken");
var http = require("http");
var opn = require("open");
var path = require("path");
var portfinder = require("portfinder");
var url = require("url");

var api = require("./api");
var { configstore } = require("./configstore");
var { FirebaseError } = require("./error");
var logger = require("./logger");
var { prompt } = require("./prompt");
var scopes = require("./scopes");

portfinder.basePort = 9005;

var open = function(url) {
  opn(url).catch(function(err) {
    logger.debug("Unable to open URL: " + err.stack);
  });
};

var INVALID_CREDENTIAL_ERROR = new FirebaseError(
  "Authentication Error: Your credentials are no longer valid. Please run " +
    clc.bold("firebase login --reauth") +
    "\n\n" +
    "For CI servers and headless environments, generate a new token with " +
    clc.bold("firebase login:ci"),
  { exit: 1 }
);

var FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
var SCOPES = [
  scopes.EMAIL,
  scopes.OPENID,
  scopes.CLOUD_PROJECTS_READONLY,
  scopes.FIREBASE_PLATFORM,
  scopes.CLOUD_PLATFORM,
];

var _nonce = _.random(1, 2 << 29).toString();
var _getPort = portfinder.getPortPromise;

// in-memory cache, so we have it for successive calls
var lastAccessToken = {};

var _getCallbackUrl = function(port) {
  if (_.isUndefined(port)) {
    return "urn:ietf:wg:oauth:2.0:oob";
  }
  return "http://localhost:" + port;
};

var _getLoginUrl = function(callbackUrl, userHint) {
  return (
    api.authOrigin +
    "/o/oauth2/auth?" +
    _.flatMap(
      {
        client_id: api.clientId,
        scope: SCOPES.join(" "),
        response_type: "code",
        state: _nonce,
        redirect_uri: callbackUrl,
        login_hint: userHint,
      },
      function(v, k) {
        if (!v) {
          return [];
        }
        return k + "=" + encodeURIComponent(v);
      }
    ).join("&")
  );
};

var _getTokensFromAuthorizationCode = function(code, callbackUrl) {
  return api
    .request("POST", "/o/oauth2/token", {
      origin: api.authOrigin,
      form: {
        code: code,
        client_id: api.clientId,
        client_secret: api.clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      },
    })
    .then(
      function(res) {
        if (!_.has(res, "body.access_token") && !_.has(res, "body.refresh_token")) {
          logger.debug("Token Fetch Error:", res.statusCode, res.body);
          throw INVALID_CREDENTIAL_ERROR;
        }
        lastAccessToken = _.assign(
          {
            expires_at: Date.now() + res.body.expires_in * 1000,
          },
          res.body
        );
        return lastAccessToken;
      },
      function(err) {
        logger.debug("Token Fetch Error:", err.stack);
        throw INVALID_CREDENTIAL_ERROR;
      }
    );
};

var GITHUB_SCOPES = ["read:user", "repo", "public_repo"];

var _getGithubLoginUrl = function(callbackUrl) {
  return (
    api.githubOrigin +
    "/login/oauth/authorize?" +
    _.flatMap(
      {
        client_id: api.githubClientId,
        state: _nonce,
        redirect_uri: callbackUrl,
        scope: GITHUB_SCOPES.join(" "),
      },
      function(v, k) {
        if (!v) {
          return [];
        }
        return k + "=" + encodeURIComponent(v);
      }
    ).join("&")
  );
};

var _getGithubTokensFromAuthorizationCode = function(code, callbackUrl) {
  return api
    .request("POST", "/login/oauth/access_token", {
      origin: api.githubOrigin,
      form: {
        client_id: api.githubClientId,
        client_secret: api.githubClientSecret,
        code,
        redirect_uri: callbackUrl,
        state: _nonce,
      },
    })
    .then((res) => {
      return res.body.access_token;
    });
};

var _respondWithFile = function(req, res, statusCode, filename) {
  return new Promise(function(resolve, reject) {
    fs.readFile(path.join(__dirname, filename), function(err, response) {
      if (err) {
        return reject(err);
      }
      res.writeHead(statusCode, {
        "Content-Length": response.length,
        "Content-Type": "text/html",
      });
      res.end(response);
      req.socket.destroy();
      return resolve();
    });
  });
};

var _loginWithoutLocalhost = function(userHint, authProvider) {
  if (authProvider === "GITHUB") {
    throw new FirebaseError("GitHub integration currently requires localhost.", { exit: 1 });
  }

  var callbackUrl = _getCallbackUrl();
  var authUrl = _getLoginUrl(callbackUrl, userHint);

  logger.info();
  logger.info("Visit this URL on any device to log in:");
  logger.info(clc.bold.underline(authUrl));
  logger.info();

  open(authUrl);

  return prompt({}, [
    {
      type: "input",
      name: "code",
      message: "Paste authorization code here:",
    },
  ])
    .then(function(answers) {
      return _getTokensFromAuthorizationCode(answers.code, callbackUrl);
    })
    .then(function(tokens) {
      return {
        user: jwt.decode(tokens.id_token),
        tokens: tokens,
        scopes: SCOPES,
      };
    });
};

var _loginWithLocalhost = function(port, userHint, authProvider) {
  return new Promise(function(resolve, reject) {
    var callbackUrl = _getCallbackUrl(port);
    var authUrl;
    if (authProvider === "GITHUB") {
      authUrl = _getGithubLoginUrl(callbackUrl);
    } else {
      authUrl = _getLoginUrl(callbackUrl, userHint);
    }

    var server = http.createServer(function(req, res) {
      var tokens;
      var query = _.get(url.parse(req.url, true), "query", {});

      if (query.state === _nonce && _.isString(query.code)) {
        if (authProvider === "GITHUB") {
          if (query.code) {
            return _respondWithFile(req, res, 200, "../templates/loginSuccessGithub.html")
              .then(() => {
                server.close();
                return _getGithubTokensFromAuthorizationCode(query.code, callbackUrl);
              })
              .then((ghAccessToken) => {
                return resolve(ghAccessToken);
              });
          }
        } else {
          return _getTokensFromAuthorizationCode(query.code, callbackUrl)
            .then(function(result) {
              tokens = result;
              return _respondWithFile(req, res, 200, "../templates/loginSuccess.html");
            })
            .then(function() {
              server.close();
              return resolve({
                user: jwt.decode(tokens.id_token),
                tokens: tokens,
              });
            })
            .catch(function() {
              return _respondWithFile(req, res, 400, "../templates/loginFailure.html");
            });
        }
      }
      _respondWithFile(req, res, 400, "../templates/loginFailure.html");
    });

    server.listen(port, function() {
      logger.info();
      logger.info("Visit this URL on this device to log in:");
      logger.info(clc.bold.underline(authUrl));
      logger.info();
      logger.info("Waiting for authentication...");

      open(authUrl);
    });

    server.on("error", function() {
      _loginWithoutLocalhost(userHint, authProvider).then(resolve, reject);
    });
  });
};

var login = function(localhost, userHint, authProvider) {
  if (localhost) {
    return _getPort().then(
      function(port) {
        return _loginWithLocalhost(port, userHint, authProvider);
      },
      function() {
        return _loginWithoutLocalhost(userHint, authProvider);
      }
    );
  }
  return _loginWithoutLocalhost(userHint, authProvider);
};

var _haveValidAccessToken = function(refreshToken, authScopes) {
  if (_.isEmpty(lastAccessToken)) {
    var tokens = configstore.get("tokens");
    if (refreshToken === _.get(tokens, "refresh_token")) {
      lastAccessToken = tokens;
    }
  }

  return (
    _.has(lastAccessToken, "access_token") &&
    lastAccessToken.refresh_token === refreshToken &&
    // verify that the exact same scopes are being used for this request
    _.isEqual(authScopes.sort(), (lastAccessToken.scopes || []).sort()) &&
    _.has(lastAccessToken, "expires_at") &&
    lastAccessToken.expires_at > Date.now() + FIFTEEN_MINUTES_IN_MS
  );
};

var _logoutCurrentSession = function(refreshToken) {
  var tokens = configstore.get("tokens");
  var currentToken = _.get(tokens, "refresh_token");
  if (refreshToken === currentToken) {
    configstore.delete("user");
    configstore.delete("tokens");
    configstore.delete("usage");
    configstore.delete("analytics-uuid");
  }
};

var _refreshAccessToken = function(refreshToken, authScopes) {
  logger.debug("> refreshing access token with scopes:", JSON.stringify(authScopes));
  return api
    .request("POST", "/oauth2/v3/token", {
      origin: api.googleOrigin,
      form: {
        refresh_token: refreshToken,
        client_id: api.clientId,
        client_secret: api.clientSecret,
        grant_type: "refresh_token",
        scope: (authScopes || []).join(" "),
      },
      logOptions: { skipRequestBody: true, skipQueryParams: true, skipResponseBody: true },
    })
    .then(
      function(res) {
        if (res.status === 401 || res.status === 400) {
          return { access_token: refreshToken };
        }

        if (!_.isString(res.body.access_token)) {
          throw INVALID_CREDENTIAL_ERROR;
        }
        lastAccessToken = _.assign(
          {
            expires_at: Date.now() + res.body.expires_in * 1000,
            refresh_token: refreshToken,
            scopes: authScopes,
          },
          res.body
        );

        var currentRefreshToken = _.get(configstore.get("tokens"), "refresh_token");
        if (refreshToken === currentRefreshToken) {
          configstore.set("tokens", lastAccessToken);
        }

        return lastAccessToken;
      },
      function(err) {
        if (_.get(err, "context.body.error") === "invalid_scope") {
          throw new FirebaseError(
            "This command requires new authorization scopes not granted to your current session. Please run " +
              clc.bold("firebase login --reauth") +
              "\n\n" +
              "For CI servers and headless environments, generate a new token with " +
              clc.bold("firebase login:ci"),
            { exit: 1 }
          );
        }

        throw INVALID_CREDENTIAL_ERROR;
      }
    );
};

var getAccessToken = function(refreshToken, authScopes) {
  if (_haveValidAccessToken(refreshToken, authScopes)) {
    return Promise.resolve(lastAccessToken);
  }

  return _refreshAccessToken(refreshToken, authScopes);
};

var logout = function(refreshToken) {
  if (lastAccessToken.refresh_token === refreshToken) {
    lastAccessToken = {};
  }
  _logoutCurrentSession(refreshToken);
  return api.request(
    "GET",
    "/o/oauth2/revoke",
    {
      origin: api.authOrigin,
      data: {
        token: refreshToken,
      },
    },
    function() {
      throw new FirebaseError("Authentication Error.", {
        exit: 1,
      });
    }
  );
};

var auth = {
  login: login,
  getAccessToken: getAccessToken,
  logout: logout,
};

module.exports = auth;
