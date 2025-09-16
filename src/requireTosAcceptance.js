"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTosAcceptance = void 0;
const error_1 = require("./error");
const firedata_1 = require("./gcp/firedata");
const api_1 = require("./api");
const auth_1 = require("./auth");
const consoleLandingPage = new Map([
    [firedata_1.APPHOSTING_TOS_ID, `${(0, api_1.consoleOrigin)()}/project/_/apphosting`],
    [firedata_1.DATA_CONNECT_TOS_ID, `${(0, api_1.consoleOrigin)()}/project/_/dataconnect`],
]);
/**
 * Returns a function that checks product terms of service. Useful for Command `before` hooks.
 *
 * Example:
 *   new Command(...)
 *     .description(...)
 *     .before(requireTosAcceptance(APPHOSTING_TOS_ID)) ;
 *
 * Note: When supporting new products, be sure to update `consoleLandingPage` above to avoid surfacing
 * generic ToS error messages.
 */
function requireTosAcceptance(tosId) {
    return () => requireTos(tosId);
}
exports.requireTosAcceptance = requireTosAcceptance;
async function requireTos(tosId) {
    // If they are not logged in, they either cannot make calls, or are using a service account.
    // Either way, no need to check TOS.
    if (!(0, auth_1.loggedIn)()) {
        return;
    }
    const res = await (0, firedata_1.getTosStatus)();
    if ((0, firedata_1.isProductTosAccepted)(res, tosId)) {
        return;
    }
    const console = consoleLandingPage.get(tosId) || (0, api_1.consoleOrigin)();
    throw new error_1.FirebaseError(`Your account has not accepted the required Terms of Service for this action. Please accept the Terms of Service and try again. ${console}`);
}
//# sourceMappingURL=requireTosAcceptance.js.map