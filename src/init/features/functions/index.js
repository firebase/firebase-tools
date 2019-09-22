"use strict";

var clc = require("cli-color");

var _ = require("lodash");

var logger = require("../../../logger");
var { prompt } = require("../../../prompt");
var enableApi = require("../../../ensureApiEnabled").enable;
var requireAccess = require("../../../requireAccess").requireAccess;
var scopes = require("../../../scopes");
var promiseAllSettled = require("../../../utils").promiseAllSettled;
var FirebaseError = require("../../../error").FirebaseError;

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
  var requiredApis = ["cloudfunctions.googleapis.com", "runtimeconfig.googleapis.com"];
  var enableApis;
  if (projectId) {
    enableApis = requireAccess({ project: projectId }, [scopes.CLOUD_PLATFORM]).then(function() {
      return promiseAllSettled(requiredApis.map((api) => enableApi(projectId, api)));
    });
  } else {
    enableApis = Promise.all([]);
  }
  return enableApis
    .then(function(results) {
      var disabledApis = [];
      results
        .filter((result) => result.state === "rejected" && result.reason.status === 403)
        .forEach((value, index) => disabledApis.push(requiredApis[index]));
      if (disabledApis.length > 0) {
        var options = {};
        return prompt(options, [
          {
            type: "list",
            name: "continue",
            message: `You don't have permission to enable the APIs : ${disabledApis.join(
              ", "
            )}.\nYou will not be able to deploy the functions while they are disabled. Do you want to proceed?`,
            default: "yes",
            choices: [
              {
                name: "Yes",
                value: "yes",
              },
              {
                name: "No",
                value: "no",
              },
            ],
          },
        ]).then(function() {
          if (options.continue === "no") {
            return Promise.reject(new FirebaseError("Initialization aborted."));
          }
        });
      }
    })
    .then(function() {
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
