"use strict";

var _ = require("lodash");
var { getFirebaseProject } = require("./management/projects");
var { FirebaseError } = require("./error");
var clc = require("cli-color");

/**
 * Tries to determine the instance ID for the provided
 * project.
 * @param {Object} options The command-line options object
 * @returns {Promise<String>} The instance ID
 */
module.exports = function(options) {
  return getFirebaseProject(options.project).then(function(project) {
    if (!_.has(project, "resources.realtimeDatabaseInstance")) {
      throw new FirebaseError(
        `It looks like you haven't created a Realtime Database instance in this project before. Go to ${clc.bold.underline(
          `https://console.firebase.google.com/project/${options.project}/database`
        )} to create your default Realtime Database instance.`,
        { exit: 1 }
      );
    }
    return _.get(project, "resources.realtimeDatabaseInstance");
  });
};
