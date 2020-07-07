"use strict";

var api = require("../api");
var utils = require("../utils");

var API_VERSION = "v1";

/**
 * Returns whether or not project has billing enabled.
 * @param {string} projectId
 * @return {!Promise<boolean>}
 */
function _checkBillingEnabled(projectId) {
  return api
    .request("GET", utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]), {
      auth: true,
      origin: api.cloudbillingOrigin,
      retryCodes: [500, 503],
    })
    .then(function(response) {
      return response.body.billingEnabled;
    });
}

/**
 * Sets billing account for project and returns whether or not action was successful.
 * @param {string} projectId
 * @return {!Promise<boolean>}
 */
function _setBillingAccount(projectId, billingAccount) {
  return api
    .request("PUT", utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]), {
      auth: true,
      origin: api.cloudbillingOrigin,
      retryCodes: [500, 503],
      data: {
        billingAccountName: billingAccount,
      },
    })
    .then(function(response) {
      return response.body.billingEnabled;
    });
}

/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<Object[]>}
 */
function _listBillingAccounts() {
  return api
    .request("GET", utils.endpoint([API_VERSION, "billingAccounts"]), {
      auth: true,
      origin: api.cloudbillingOrigin,
      retryCodes: [500, 503],
    })
    .then(function(response) {
      return response.body.billingAccounts || [];
    });
}

module.exports = {
  checkBillingEnabled: _checkBillingEnabled,
  listBillingAccounts: _listBillingAccounts,
  setBillingAccount: _setBillingAccount,
};
