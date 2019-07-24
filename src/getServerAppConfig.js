"use strict";

const api = require("./api");

/**
 * Gets project-specific config values needed to initialize firebase-admin
 * @param {string} projectId
 * @returns {Object<string,string>} Object with 3 keys: projectId, databaseURL, and storageBucket
 */
module.exports = function(projectId) {
  return api
    .request("GET", "/v1/projects/" + projectId, {
      auth: true,
      origin: api.resourceManagerOrigin,
    })
    .then(function(response) {
      const projectNumber = response.body.projectNumber;
      return api.request("GET", "/v1/projects/" + projectNumber + ":getServerAppConfig", {
        auth: true,
        origin: api.firedataOrigin,
      });
    })
    .then((response) => response.body);
};
