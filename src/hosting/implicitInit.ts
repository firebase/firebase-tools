"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var fs = require("fs");
var { fetchWebSetup, getCachedWebSetup } = require("../fetchWebSetup");
var utils = require("../utils");
var logger = require("../logger");

var INIT_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/hosting/init.js", "utf8");

module.exports = async function(options) {
  let config;
  try {
    config = await fetchWebSetup(options);
  } catch (e) {
    logger.debug("fetchWebSetup error: " + e);
    const statusCode = _.get(e, "context.response.statusCode");
    if (statusCode === 403) {
      utils.logLabeledWarning(
        "hosting",
        `Authentication error when trying to fetch your current web app configuration, have you run ${clc.bold(
          "firebase login"
        )}?`
      );
    }
  }

  if (!config) {
    config = getCachedWebSetup(options);
    if (config) {
      utils.logLabeledWarning("hosting", "Using web app configuration from cache.");
    }
  }

  if (!config) {
    config = undefined;
    utils.logLabeledWarning(
      "hosting",
      "Could not fetch web app configuration and there is no cached configuration on this machine. " +
        "Check your internet connection and make sure you are authenticated. " +
        "To continue, you must call firebase.initializeApp({...}) in your code before using Firebase."
    );
  }

  const configJson = JSON.stringify(config, null, 2);
  return {
    js: INIT_TEMPLATE.replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`),
    json: configJson,
  };
};
