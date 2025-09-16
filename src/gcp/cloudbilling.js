"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBillingAccounts = exports.setBillingAccount = exports.checkBillingEnabled = exports.isBillingEnabled = void 0;
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const utils = __importStar(require("../utils"));
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
//# sourceMappingURL=cloudbilling.js.map