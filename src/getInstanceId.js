"use strict";

var _ = require("lodash");
var { getFirebaseProject } = require("./management/projects");
var logger = require("./logger");

/**
 * Tries to determine the instance ID for the provided
 * project.
 * @param {Object} options The command-line options object
 * @returns {Promise<String>} The instance ID
 */
module.exports = function(options) {
  return getFirebaseProject(options.project).then(function(project) {
    if (!_.has(project, "resources.realtimeDatabaseInstance")) {
      logger.debug(
        "[WARNING] Unable to fetch default resources. Falling back to project id (" +
          options.project +
          ")"
      );
      return options.project;
    }

    return _.get(project, "resources.realtimeDatabaseInstance");
  });
};
