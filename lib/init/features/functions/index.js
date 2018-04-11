"use strict";

var chalk = require("chalk");

var _ = require("lodash");

var logger = require("../../../logger");
var prompt = require("../../../prompt");
var enableApi = require("../../../ensureApiEnabled").enable;
var requireAccess = require("../../../requireAccess");
var scopes = require("../../../scopes");

module.exports = function(setup, config) {
  logger.info();
  logger.info(
    "A " + chalk.bold("functions") + " directory will be created in your project with a Node.js"
  );
  logger.info(
    "package pre-configured. Functions can be deployed with " + chalk.bold("firebase deploy") + "."
  );
  logger.info();

  setup.functions = {};
  var projectId = _.get(setup, "rcfile.projects.default");
  var enableApis;
  if (projectId) {
    enableApis = requireAccess({ project: projectId }, [scopes.CLOUD_PLATFORM]).then(function() {
      enableApi(projectId, "cloudfunctions.googleapis.com");
      enableApi(projectId, "runtimeconfig.googleapis.com");
    });
  } else {
    enableApis = Promise.resolve();
  }
  return enableApis.then(function() {
    return prompt(setup.functions, [
      {
        type: "list",
        name: "language",
        message: "What language would you like to use to write Cloud Functions?",
        default: "javascript",
        choices: [
          {
            name: "JavaScript",
            value: "javascript",
          },
          {
            name: "TypeScript",
            value: "typescript",
          },
        ],
      },
    ]).then(function() {
      return require("./" + setup.functions.language)(setup, config);
    });
  });
};
