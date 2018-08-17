"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var getInstanceId = require("./getInstanceId");
var getProjectId = require("./getProjectId");
var FirebaseError = require("./error");
var identifierToProjectId = require("./identifierToProjectId");
var requireAuth = require("./requireAuth");

module.exports = function(options, authScopes) {
  var projectId = getProjectId(options);
  options.project = projectId;

  if (process.env.FIREBASE_BYPASS_ADMIN_CALLS_FOR_TESTING === "true") {
    return requireAuth(options, authScopes);
  }

  return requireAuth(options, authScopes)
    .then(function() {
      return getInstanceId(options);
    })
    .then(function(instance) {
      options.instance = instance;
      return;
    })
    .catch(function(err) {
      if (err && err.exit && _.get(err, "context.body.error.code") !== "PROJECT_NOT_FOUND") {
        return Promise.reject(err);
      }

      return identifierToProjectId(projectId).then(function(realProjectId) {
        if (realProjectId) {
          var fixCommand = "firebase use " + realProjectId;
          if (options.projectAlias) {
            fixCommand += " --alias " + options.projectAlias;
          }

          return Promise.reject(
            new FirebaseError(
              "Tried to access unrecognized project " +
                clc.bold(projectId) +
                ", but found matching instance for project " +
                clc.bold(realProjectId) +
                ".\n\n" +
                "To use " +
                clc.bold(realProjectId) +
                " instead, run:\n\n  " +
                clc.bold(fixCommand)
            ),
            { exit: 1 }
          );
        }

        return Promise.reject(
          new FirebaseError("Unable to authorize access to project " + clc.bold(projectId), {
            exit: 1,
          })
        );
      });
    });
};
