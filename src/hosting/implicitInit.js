"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var fs = require("fs");
var { fetchWebSetup, getCachedWebSetup } = require("../fetchWebSetup");
var utils = require("../utils");
var logger = require("../logger");
const { EmulatorRegistry } = require("../emulator/registry");

var INIT_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/hosting/init.js", "utf8");
const FIREBASE_CONFIG = "/*--CONFIG--*/";
const EMULATORS_CONFIG = "/*--EMULATORCONFIG--*/";

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

  const firebaseJson = JSON.stringify(config, null, 2);

  const emulatorConfig = {};
  if (EmulatorRegistry.isRunning("firestore")) {
    const { host, port } = EmulatorRegistry.get("firestore").getInfo();
    emulatorConfig["firestore"] = `${host}:${port}`;
  }
  if (EmulatorRegistry.isRunning("functions")) {
    const { host, port } = EmulatorRegistry.get("functions").getInfo();
    emulatorConfig["functions"] = `http://${host}:${port}`;
  }
  if (EmulatorRegistry.isRunning("database")) {
    const { host, port } = EmulatorRegistry.get("database").getInfo();
    if (options.project) {
      emulatorConfig["database"] = `http://${host}:${port}/?ns=${options.project}`;
    }
  }
  const emulatorsJson = JSON.stringify(emulatorConfig, null, 2);

  let configJs = INIT_TEMPLATE;
  configJs = configJs.replace(FIREBASE_CONFIG, `var firebaseConfig = ${firebaseJson};`);
  configJs = configJs.replace(EMULATORS_CONFIG, `var emulatorConfig = ${emulatorsJson};`);

  return {
    js: configJs,
    json: firebaseJson,
  };
};
