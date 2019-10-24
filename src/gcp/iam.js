"use strict";

var api = require("../api");
var utils = require("../utils");

var API_VERSION = "v1";

/**
 * Creates a new the service account with the given parameters.
 *
 * @param {string} projectId the id of the project where the service account will be created
 * @param {string} accountId the id to use for the account
 * @param {string} description a brief description of the account
 * @param {string} displayName a user-friendly name to be displayed on the console
 */
function createServiceAccount(projectId, accountId, description, displayName) {
  return api
    .request("POST", `/${API_VERSION}/projects/${projectId}/serviceAccounts`, {
      auth: true,
      origin: api.iamOrigin,
      data: {
        accountId,
        serviceAccount: {
          displayName,
          description,
        },
      },
    })
    .then((res) => {
      return res.body;
    });
}

/**
 *
 * @param {string} projectId the id of the project containing the service account
 * @param {string} accountEmail the email of the service account to delete
 */
function deleteServiceAccount(projectId, accountEmail) {
  return api.request(
    "DELETE",
    `/${API_VERSION}/projects/${projectId}/serviceAccounts/${accountEmail}`,
    {
      auth: true,
      origin: api.iamOrigin,
      resolveOnHTTPError: true,
    }
  );
}

/**
 * Given a name, returns corresponding Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details.
 * @param {string} role
 * @return {!Promise<?>}
 */
function getRole(role) {
  return api
    .request("GET", utils.endpoint([API_VERSION, "roles", role]), {
      auth: true,
      origin: api.iamOrigin,
      retryCodes: [500, 503],
    })
    .then(function(response) {
      return response.body;
    });
}

module.exports = {
  createServiceAccount,
  deleteServiceAccount,
  getRole,
};
