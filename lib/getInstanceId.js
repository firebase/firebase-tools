"use strict";

var _ = require("lodash");
var api = require("./api");
var logger = require("./logger");

/**
 * Tries to determine the instance ID for the provided
 * project.
 * @param {Object} options The command-line options object
 * @returns {Promise<String>} The instance ID
 */
module.exports = function(options) {
  return api
    .request("GET", `/v1beta1/projects/${options.project}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then(function(response) {
      if (!_.has(response, "body.resources.realtimeDatabaseInstance")) {
        logger.debug(
          "[WARNING] Unable to fetch default resources. Falling back to project id (" +
            options.project +
            ")"
        );
        return options.project;
      }

      return _.get(response, "body.resources.realtimeDatabaseInstance");
    });
};
