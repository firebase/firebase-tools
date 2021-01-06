"use strict";

var clc = require("cli-color");

var _ = require("lodash");

var logger = require("../../../logger");
var { prompt } = require("../../../prompt");
var enableApi = require("../../../ensureApiEnabled").enable;
var { requirePermissions } = require("../../../requirePermissions");

module.exports = function(setup, config) {
  logger.info();
  logger.info(
    "A " + clc.bold("functions") + " directory will be created in your project with a Node.js"
  );
  logger.info(
    "package pre-configured. Functions can be deployed with " + clc.bold("firebase deploy") + "."
  );
  logger.info();

  setup.functions = {};
  var projectId = _.get(setup, "rcfile.projects.default");
  /** @type {Promise<*>} */
  var enableApis = Promise.resolve();
  if (projectId) {
    enableApis = requirePermissions({ project: projectId }).then(() => {
      return Promise.all([
        enableApi(projectId, "cloudfunctions.googleapis.com"),
        enableApi(projectId, "runtimeconfig.googleapis.com"),
      ]);
    });
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
