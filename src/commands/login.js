"use strict";

var { Command } = require("../command");
var logger = require("../logger");
var { configstore } = require("../configstore");
var clc = require("cli-color");
var utils = require("../utils");
var { prompt } = require("../prompt");

var auth = require("../auth");

module.exports = new Command("login")
  .description("log the CLI into Firebase")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication"
  )
  .option("--reauth", "force reauthentication even if already logged in")
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject(
        "Cannot run login in non-interactive mode. See " +
          clc.bold("login:ci") +
          " to generate a token for use in non-interactive environments.",
        { exit: 1 }
      );
    }

    var user = configstore.get("user");
    var tokens = configstore.get("tokens");

    if (user && tokens && !options.reauth) {
      logger.info("Already logged in as", clc.bold(user.email));
      return Promise.resolve(user);
    }

    utils.logBullet(
      "Firebase optionally collects CLI usage and error reporting information to help improve our products. Data is collected in accordance with Google's privacy policy (https://policies.google.com/privacy) and is not used to identify you.\n"
    );
    return prompt(options, [
      {
        type: "confirm",
        name: "collectUsage",
        message: "Allow Firebase to collect CLI usage and error reporting information?",
      },
    ])
      .then(function() {
        configstore.set("usage", options.collectUsage);
        if (options.collectUsage) {
          utils.logBullet(
            "To change your data collection preference at any time, run `firebase logout` and log in again."
          );
        }
        return auth.login(options.localhost);
      })
      .then(function(result) {
        configstore.set("user", result.user);
        configstore.set("tokens", result.tokens);
        // store login scopes in case mandatory scopes grow over time
        configstore.set("loginScopes", result.scopes);
        // remove old session token, if it exists
        configstore.delete("session");

        logger.info();
        utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));

        return auth;
      });
  });
