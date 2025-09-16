"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBilling = void 0;
const cloudbilling_1 = require("../../gcp/cloudbilling");
const checkProjectBilling_1 = require("../../extensions/checkProjectBilling");
const error_1 = require("../../error");
async function checkBilling(projectId, nonInteractive) {
    const enabled = await (0, cloudbilling_1.checkBillingEnabled)(projectId);
    if (!enabled && nonInteractive) {
        throw new error_1.FirebaseError(`Extensions require the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
            `Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project.`);
    }
    else if (!enabled) {
        await (0, checkProjectBilling_1.enableBilling)(projectId);
    }
}
exports.checkBilling = checkBilling;
