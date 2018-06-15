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
    if (!_.has(project, ["instances", "database"])) {
      throw new FirebaseError("No instance found for project. Please try a different project.", {
        exit: 1,
      });
    }
    if (!_.isArray(project.instances.database)) {
      throw new FirebaseError("No instance found for project. Please try a different project.", {
        exit: 1,
      });
    }
    if (!_.has(options, ["instance"])) {
      return project.instances.database[0];
    } else if (_.includes(project.instances.database, options.instance)) {
      return options.instance;
    } else {
      throw new FirebaseError(
        "No instance named '" +
          options.instance +
          "' found for project. Available options: " +
          project.instances.database.join(", ") +
          ". Please try a different instance on this project, " +
          "or switch to a different project using `firebase use`.",
        {
          exit: 1,
        }
      );
    }
  });
};
