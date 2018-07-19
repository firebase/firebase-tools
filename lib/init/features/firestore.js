"use strict";

var chalk = require("chalk");
var fs = require("fs");

var gcp = require("../../gcp");
var fsutils = require("../../fsutils");
var prompt = require("../../prompt");
var logger = require("../../logger");
var utils = require("../../utils");

var RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/firestore/firestore.rules",
  "utf8"
);

var DEFAULT_RULES_FILE = "firestore.rules";

var INDEXES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/firestore/firestore.indexes.json",
  "utf8"
);

var _initRules = function(setup, config) {
  logger.info();
  logger.info("Firestore Security Rules allow you to define how and when to allow");
  logger.info("requests. You can keep these rules in your project directory");
  logger.info("and publish them with " + chalk.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: "input",
      name: "rules",
      message: "What file should be used for Firestore Rules?",
      default: DEFAULT_RULES_FILE,
    },
  ])
    .then(function() {
      var filename = setup.config.firestore.rules;

      if (fsutils.fileExistsSync(filename)) {
        var msg =
          "File " +
          chalk.bold(filename) +
          " already exists." +
          " Do you want to overwrite it with the Firestore Rules from the Firebase Console?";
        return prompt.once({
          type: "confirm",
          message: msg,
          default: false,
        });
      }

      return Promise.resolve(true);
    })
    .then(function(overwrite) {
      if (!overwrite) {
        return Promise.resolve();
      }

      return _getRulesFromConsole(setup.projectId).then(function(contents) {
        return config.writeProjectFile(setup.config.firestore.rules, contents);
      });
    });
};

var _getRulesFromConsole = function(projectId) {
  return gcp.rules
    .getLatestRulesetName(projectId)
    .then(function(name) {
      if (!name) {
        logger.debug("No rulesets found, using default.");
        return [{ name: DEFAULT_RULES_FILE, content: RULES_TEMPLATE }];
      }

      logger.debug("Found ruleset: " + name);
      return gcp.rules.getRulesetContent(name);
    })
    .then(function(rules) {
      if (rules.length <= 0) {
        return utils.reject("Ruleset has no files", { exit: 1 });
      }

      if (rules.length > 1) {
        return utils.reject("Ruleset has too many files: " + rules.length, { exit: 1 });
      }

      // Even though the rules API allows for multi-file rulesets, right
      // now both the console and the CLI are built on the single-file
      // assumption.
      return rules[0].content;
    });
};

var _initIndexes = function(setup, config) {
  logger.info();
  logger.info("Firestore indexes allow you to perform complex queries while");
  logger.info("maintaining performance that scales with the size of the result");
  logger.info("set. You can keep index definitions in your project directory");
  logger.info("and publish them with " + chalk.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: "input",
      name: "indexes",
      message: "What file should be used for Firestore indexes?",
      default: "firestore.indexes.json",
    },
  ]).then(function() {
    return config.writeProjectFile(setup.config.firestore.indexes, INDEXES_TEMPLATE);
  });
};

module.exports = function(setup, config) {
  setup.config.firestore = {};

  return _initRules(setup, config).then(function() {
    return _initIndexes(setup, config);
  });
};
