"use strict";

var { Command } = require("../command");
var clc = require("cli-color");
var utils = require("../utils");
var logger = require("../logger");
var auth = require("../auth");

module.exports = new Command("login:ci")
  .description("generate an access token for use in non-interactive environments")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication"
  )
  .action(async (options) => {
    if (options.nonInteractive) {
      return utils.reject("Cannot run login:ci in non-interactive mode.", {
        exit: 1,
      });
    }

    const userCredentials = await auth.loginGoogle(options.localhost);
    logger.info();
    utils.logSuccess(
      "Success! Use this token to login on a CI server:\n\n" +
        clc.bold(userCredentials.tokens.refresh_token) +
        '\n\nExample: firebase deploy --token "$FIREBASE_TOKEN"\n'
    );
    return userCredentials;
  });
