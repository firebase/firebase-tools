"use strict";

var _ = require("lodash");

var api = require("../api");
var logger = require("../logger");
var utils = require("../utils");

var API_VERSION = "v1";

function _handleErrorResponse(response) {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with rules.", {
    code: 2,
  });
}

/**
 * Gets the latest ruleset name on the project.
 * @param {String} projectId Project from which you want to get the ruleset.
 * @param {String} service Service for the ruleset (ex: cloud.firestore or firebase.storage).
 * @returns {String} Name of the latest ruleset.
 */
function getLatestRulesetName(projectId, service) {
  return api
    .request("GET", "/" + API_VERSION + "/projects/" + projectId + "/releases", {
      auth: true,
      origin: api.rulesOrigin,
    })
    .then(function(response) {
      if (response.status == 200) {
        if (response.body.releases && response.body.releases.length > 0) {
          var releases = _.orderBy(response.body.releases, ["updateTime"], ["desc"]);

          var prefix = "projects/" + projectId + "/releases/" + service;
          var release = _.find(releases, function(r) {
            return r.name.indexOf(prefix) == 0;
          });

          if (!release) {
            return null;
          }
          return release.rulesetName;
        }

        // In this case it's likely that Firestore has not been used on this project before.
        return null;
      }

      return _handleErrorResponse(response);
    });
}

/**
 * Gets the full contents of a ruleset.
 * @param {String} name Name of the ruleset.
 * @return {Array<Object>} Array of files in the ruleset. Each entry has form { content, name }.
 */
function getRulesetContent(name) {
  return api
    .request("GET", "/" + API_VERSION + "/" + name, {
      auth: true,
      origin: api.rulesOrigin,
    })
    .then(function(response) {
      if (response.status == 200) {
        return response.body.source.files;
      }

      return _handleErrorResponse(response);
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
  getLatestRulesetName: getLatestRulesetName,
  getRulesetContent: getRulesetContent,
};
