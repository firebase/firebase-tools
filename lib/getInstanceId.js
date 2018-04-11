"use strict";

var _ = require("lodash");
var api = require("./api");
var FirebaseError = require("./error");

/**
 * Tries to determine the instance ID for the provided
 * project.
 * @param {Object} options The command-line options object
 * @returns {Promise<String>} The instance ID
 */
module.exports = function(options) {
  return api.getProject(options.project).then(function(project) {
    if (!_.has(project, ["instances", "database", 0])) {
      throw new FirebaseError("No instance found for project. Please try a different project.", {
        exit: 1,
      });
    }
    return project.instances.database[0];
  });
};
