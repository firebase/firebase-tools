"use strict";

var Command = require("../lib/command");
var clc = require("cli-color");
var utils = require("../lib/utils");
var logger = require("../lib/logger");
var auth = require("../lib/auth");

module.exports = new Command("login:ci")
  .description("generate an access token for use in non-interactive environments")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication"
  )
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject("Cannot run login:ci in non-interactive mode.", {
        exit: 1,
      });
    }

    return auth.login(options.localhost).then(function(result) {
      logger.info();
      utils.logSuccess(
        "Success! Use this token to login on a CI server:\n\n" +
          clc.bold(result.tokens.refresh_token) +
          '\n\nExample: firebase deploy --token "$FIREBASE_TOKEN"\n'
      );
      return result;
    });
  });
