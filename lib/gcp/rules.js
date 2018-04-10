"use strict";

var api = require("../api");
var logger = require("../logger");
var utils = require("../utils");

var API_VERSION = "v1";

function _handleErrorResponse(response) {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered deploying rules.", {
    code: 2,
  });
}

/**
 * Creates a new ruleset which can then be associated with a release.
 * @param {String} projectId Project on which you want to create the ruleset.
 * @param {Array} files Array of `{name, content}` for the source files.
 */
function createRuleset(projectId, files) {
  var payload = { source: { files: files } };

  return api
    .request("POST", "/" + API_VERSION + "/projects/" + projectId + "/rulesets", {
      auth: true,
      data: payload,
      origin: api.rulesOrigin,
    })
    .then(function(response) {
      if (response.status === 200) {
        logger.debug("[rules] created ruleset", response.body.name);
        return response.body.name;
      }

      return _handleErrorResponse(response);
    });
}

/**
 * Create a new named release with the specified ruleset.
 * @param {String} projectId Project on which you want to create the ruleset.
 * @param {String} rulesetName The unique identifier for the ruleset you want to release.
 * @param {String} releaseName The name (e.g. `firebase.storage`) of the release you want to create.
 */
function createRelease(projectId, rulesetName, releaseName) {
  var payload = {
    name: "projects/" + projectId + "/releases/" + releaseName,
    rulesetName: rulesetName,
  };

  return api
    .request("POST", "/" + API_VERSION + "/projects/" + projectId + "/releases", {
      auth: true,
      data: payload,
      origin: api.rulesOrigin,
    })
    .then(function(response) {
      if (response.status === 200) {
        logger.debug("[rules] created release", response.body.name);
        return response.body.name;
      }

      return _handleErrorResponse(response);
    });
}

/**
 * Update an existing release with the specified ruleset.
 * @param {String} projectId Project on which you want to create the ruleset.
 * @param {String} rulesetName The unique identifier for the ruleset you want to release.
 * @param {String} releaseName The name (e.g. `firebase.storage`) of the release you want to update.
 */
function updateRelease(projectId, rulesetName, releaseName) {
  var payload = {
    release: {
      name: "projects/" + projectId + "/releases/" + releaseName,
      rulesetName: rulesetName,
    },
  };

  return api
    .request("PATCH", "/" + API_VERSION + "/projects/" + projectId + "/releases/" + releaseName, {
      auth: true,
      data: payload,
      origin: api.rulesOrigin,
    })
    .then(function(response) {
      if (response.status === 200) {
        logger.debug("[rules] updated release", response.body.name);
        return response.body.name;
      }

      return _handleErrorResponse(response);
    });
}

function updateOrCreateRelease(projectId, rulesetName, releaseName) {
  logger.debug("[rules] releasing", releaseName, "with ruleset", rulesetName);
  return updateRelease(projectId, rulesetName, releaseName).catch(function() {
    logger.debug("[rules] ruleset update failed, attempting to create instead");
    return createRelease(projectId, rulesetName, releaseName);
  });
}

function testRuleset(projectId, files) {
  return api.request(
    "POST",
    "/" + API_VERSION + "/projects/" + encodeURIComponent(projectId) + ":test",
    {
      origin: api.rulesOrigin,
      data: {
        source: { files: files },
      },
      auth: true,
    }
  );
}

module.exports = {
  createRuleset: createRuleset,
  createRelease: createRelease,
  updateRelease: updateRelease,
  updateOrCreateRelease: updateOrCreateRelease,
  testRuleset: testRuleset,
};
