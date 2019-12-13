"use strict";

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
  }

  if (!config) {
    config = getCachedWebSetup(options);
    if (config) {
      utils.logLabeledWarning(
        "hosting",
        "You are offline, using web app configuration from cache."
      );
    }
  }

  if (!config) {
    config = undefined;
    utils.logLabeledWarning(
      "hosting",
      "You are offline and there is no cached configuration on this machine. You must call firebase.initializeApp({...}) in your code before using Firebase."
    );
  }

  const configJson = JSON.stringify(config, null, 2);
  return {
    js: INIT_TEMPLATE.replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`),
    json: configJson,
  };
};
