"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBillingAccounts = exports.setBillingAccount = exports.checkBillingEnabled = exports.isBillingEnabled = void 0;
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const utils = require("../utils");
const API_VERSION = "v1";
const client = new apiv2_1.Client({ urlPrefix: (0, api_1.cloudbillingOrigin)(), apiVersion: API_VERSION });
/**
 * Returns whether or not project has billing enabled.
 * Cache the result in the init Setup metadata.
 * @param setup
 */
async function isBillingEnabled(setup) {
    if (setup.isBillingEnabled !== undefined) {
        return setup.isBillingEnabled;
    }
    if (!setup.projectId) {
        return false;
    }
    setup.isBillingEnabled = await checkBillingEnabled(setup.projectId);
    return setup.isBillingEnabled;
}
exports.isBillingEnabled = isBillingEnabled;
/**
 * Returns whether or not project has billing enabled.
 * @param projectId
 */
async function checkBillingEnabled(projectId) {
    const res = await client.get(utils.endpoint(["projects", projectId, "billingInfo"]), { retryCodes: [500, 503] });
    return res.body.billingEnabled;
}
exports.checkBillingEnabled = checkBillingEnabled;
/**
 * Sets billing account for project and returns whether or not action was successful.
 * @param {string} projectId
 * @return {!Promise<boolean>}
 */
async function setBillingAccount(projectId, billingAccountName) {
    const res = await client.put(utils.endpoint(["projects", projectId, "billingInfo"]), {
        billingAccountName: billingAccountName,
    }, { retryCodes: [500, 503] });
    return res.body.billingEnabled;
}
exports.setBillingAccount = setBillingAccount;
/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<Object[]>}
 */
async function listBillingAccounts() {
    const res = await client.get(utils.endpoint(["billingAccounts"]), { retryCodes: [500, 503] });
    return res.body.billingAccounts || [];
}
exports.listBillingAccounts = listBillingAccounts;
