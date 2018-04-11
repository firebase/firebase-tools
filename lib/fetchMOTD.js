"use strict";
var logger = require("./logger");
var request = require("request");
var configstore = require("./configstore");
var _ = require("lodash");
var pkg = require("../package.json");
var semver = require("semver");
var chalk = require("chalk");
var utils = require("./utils");
var api = require("./api");

var ONE_DAY_MS = 1000 * 60 * 60 * 24;

module.exports = function() {
  var motd = configstore.get("motd");
  var motdFetched = configstore.get("motd.fetched") || 0;

  if (motd && motdFetched > Date.now() - ONE_DAY_MS) {
    if (motd.minVersion && semver.gt(motd.minVersion, pkg.version)) {
      logger.error(
        chalk.red("Error:"),
        "CLI is out of date (on",
        chalk.bold(pkg.version),
        ", need at least",
        chalk.bold(motd.minVersion) + ")\n\nRun",
        chalk.bold("npm install -g firebase-tools"),
        "to upgrade."
      );
      process.exit(1);
    }

    if (motd.message && process.stdout.isTTY) {
      var lastMessage = configstore.get("motd.lastMessage");
      if (lastMessage !== motd.message) {
        logger.info();
        logger.info(motd.message);
        logger.info();
        configstore.set("motd.lastMessage", motd.message);
      }
    }
  } else {
    request(
      {
        url: utils.addSubdomain(api.realtimeOrigin, "firebase-public") + "/cli.json",
        json: true,
      },
      function(err, res, body) {
        if (err) {
          return;
        }
        motd = _.assign({}, body);
        configstore.set("motd", motd);
        configstore.set("motd.fetched", Date.now());
      }
    );
  }
};
