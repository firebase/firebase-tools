"use strict";

var clc = require("cli-color");

var autoAuth = require("google-auto-auth");

var api = require("./api");
var configstore = require("./configstore");
var FirebaseError = require("./error");
var logger = require("./logger");
var utils = require("./utils");
var scopes = require("./scopes");

var AUTH_ERROR = new FirebaseError(
  "Command requires authentication, please run " + clc.bold("firebase login")
);

function _autoAuth(options, authScopes) {
  return new Promise(function(resolve, reject) {
    logger.debug("> attempting to authenticate via app default credentials");
    autoAuth({ scopes: authScopes }).getToken(function(err, token) {
      if (err) {
        logger.debug("! auto-auth error:", err.message);
        logger.debug("> no credentials could be found or automatically retrieved");
        return reject(AUTH_ERROR);
      }

      logger.debug(token);
      logger.debug("> retrieved access token via default credentials");
      api.setAccessToken(token);
      resolve();
    });
  });
}

module.exports = function(options, authScopes) {
  api.setScopes([scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]);
  options.authScopes = api.commandScopes;

  var tokens = configstore.get("tokens");
  var user = configstore.get("user");

  var tokenOpt = utils.getInheritedOption(options, "token");
  if (tokenOpt) {
    logger.debug("> authorizing via --token option");
  } else if (process.env.FIREBASE_TOKEN) {
    logger.debug("> authorizing via FIREBASE_TOKEN environment variable");
  } else if (user) {
    logger.debug("> authorizing via signed-in user");
  } else {
    return _autoAuth(options, authScopes);
  }

  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    api.setRefreshToken(tokenOpt);
    return Promise.resolve();
  }

  if (!user || !tokens) {
    return new Promise(function(resolve, reject) {
      if (configstore.get("session")) {
        return reject(
          new FirebaseError(
            "This version of Firebase CLI requires reauthentication.\n\nPlease run " +
              clc.bold("firebase login") +
              " to regain access."
          )
        );
      }
      return reject(AUTH_ERROR);
    });
  }

  options.user = user;
  options.tokens = tokens;
  api.setRefreshToken(tokens.refresh_token);
  return Promise.resolve();
};
