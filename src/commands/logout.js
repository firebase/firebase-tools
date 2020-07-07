"use strict";

var { Command } = require("../command");
var { configstore } = require("../configstore");
var logger = require("../logger");
var clc = require("cli-color");

var utils = require("../utils");
var api = require("../api");
var auth = require("../auth");
var _ = require("lodash");
var { clearCredentials } = require("../defaultCredentials");

module.exports = new Command("logout")
  .description("log the CLI out of Firebase")
  .action(function(options) {
    var user = configstore.get("user");
    var tokens = configstore.get("tokens");
    var currentToken = _.get(tokens, "refresh_token");
    var token = utils.getInheritedOption(options, "token") || currentToken;
    api.setRefreshToken(token);
    var next;
    if (token) {
      clearCredentials();
      next = auth.logout(token);
    } else {
      next = Promise.resolve();
    }

    var cleanup = function() {
      if (token || user || tokens) {
        var msg = "Logged out";
        if (token === currentToken) {
          if (user) {
            msg += " from " + clc.bold(user.email);
          }
        } else {
          msg += ' token "' + clc.bold(token) + '"';
        }
        utils.logSuccess(msg);
      } else {
        logger.info("No need to logout, not logged in");
      }
    };

    return next.then(cleanup, function() {
      utils.logWarning("Invalid refresh token, did not need to deauthorize");
      cleanup();
    });
  });
