"use strict";

var clc = require("cli-color");
var fs = require("fs");

var prompt = require("../../prompt");
var logger = require("../../logger");

var RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/storage/storage.rules",
  "utf8"
);

module.exports = function(setup, config) {
  setup.config.storage = {};

  logger.info();
  logger.info("Firebase Storage Security Rules allow you to define how and when to allow");
  logger.info("uploads and downloads. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.storage, [
    {
      type: "input",
      name: "rules",
      message: "What file should be used for Storage Rules?",
      default: "storage.rules",
    },
  ]).then(function() {
    return config.writeProjectFile(setup.config.storage.rules, RULES_TEMPLATE);
  });
};
