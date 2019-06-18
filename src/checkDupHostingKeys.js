"use strict";

var _ = require("lodash");

var utils = require("./utils");
var clc = require("cli-color");
var Config = require("./config");
var FirebaseError = require("./error");
var logger = require("./logger");

module.exports = function(options) {
  return new Promise(function(resolve, reject) {
    var src = options.config._src;
    var legacyKeys = Config.LEGACY_HOSTING_KEYS;

    var hasLegacyKeys = _.reduce(
      legacyKeys,
      function(result, key) {
        return result || _.has(src, key);
      },
      false
    );

    if (hasLegacyKeys && _.has(src, ["hosting"])) {
      utils.logWarning(
        clc.bold.yellow("hosting: ") +
          "We found a " +
          clc.bold("hosting") +
          " key inside " +
          clc.bold("firebase.json") +
          " as well as hosting configuration keys that are not nested inside the " +
          clc.bold("hosting") +
          " key."
      );
      logger.info("\n\nPlease run " + clc.bold("firebase tools:migrate") + " to fix this issue.");
      logger.info(
        "Please note that this will overwrite any configuration keys nested inside the " +
          clc.bold("hosting") +
          " key with configuration keys at the root level of " +
          clc.bold("firebase.json.")
      );
      reject(
        new FirebaseError("Hosting key and legacy hosting keys are both present in firebase.json.")
      );
    } else {
      resolve();
    }
  });
};
