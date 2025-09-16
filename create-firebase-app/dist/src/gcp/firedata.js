"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductTosAccepted = exports.getAcceptanceStatus = exports.getTosStatus = exports.DATA_CONNECT_TOS_ID = exports.APP_CHECK_TOS_ID = exports.APPHOSTING_TOS_ID = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const error_1 = require("../error");
const client = new apiv2_1.Client({ urlPrefix: (0, api_1.firedataOrigin)(), auth: true, apiVersion: "v1" });
exports.APPHOSTING_TOS_ID = "APP_HOSTING_TOS";
exports.APP_CHECK_TOS_ID = "APP_CHECK";
exports.DATA_CONNECT_TOS_ID = "FIREBASE_DATA_CONNECT";
/**
 * Fetches the Terms of Service status for the logged in user.
 */
async function getTosStatus() {
    const res = await client.get("accessmanagement/tos:getStatus");
    return res.body;
}
exports.getTosStatus = getTosStatus;
/** Returns the AcceptanceStatus for a given product. */
function getAcceptanceStatus(response, tosId) {
    const perServiceStatus = response.perServiceStatus.find((tosStatus) => tosStatus.tosId === tosId);
    if (perServiceStatus === undefined) {
        throw new error_1.FirebaseError(`Missing terms of service status for product: ${tosId}`);
    }
    return perServiceStatus.serviceStatus.status;
}
exports.getAcceptanceStatus = getAcceptanceStatus;
/** Returns true if a product's ToS has been accepted. */
function isProductTosAccepted(response, tosId) {
    return getAcceptanceStatus(response, tosId) === "ACCEPTED";
}
exports.isProductTosAccepted = isProductTosAccepted;
