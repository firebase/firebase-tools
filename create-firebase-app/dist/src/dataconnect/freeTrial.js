"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upgradeInstructions = exports.checkFreeTrialInstanceUsed = exports.freeTrialTermsLink = void 0;
const clc = require("colorette");
const cloudmonitoring_1 = require("../gcp/cloudmonitoring");
const utils = require("../utils");
function freeTrialTermsLink() {
    return "https://firebase.google.com/pricing";
}
exports.freeTrialTermsLink = freeTrialTermsLink;
const FREE_TRIAL_METRIC = "sqladmin.googleapis.com/fdc_lifetime_free_trial_per_project";
// Checks whether there is already a free trial instance on a project.
async function checkFreeTrialInstanceUsed(projectId) {
    const past7d = new Date();
    past7d.setDate(past7d.getDate() - 7);
    const query = {
        filter: `metric.type="serviceruntime.googleapis.com/quota/allocation/usage" AND metric.label.quota_metric = "${FREE_TRIAL_METRIC}"`,
        "interval.endTime": new Date().toJSON(),
        "interval.startTime": past7d.toJSON(),
    };
    let used = true;
    try {
        const ts = await (0, cloudmonitoring_1.queryTimeSeries)(query, projectId);
        if (ts.length) {
            used = ts[0].points.some((p) => p.value.int64Value);
        }
    }
    catch (err) {
        // If the metric doesn't exist, free trial is not used.
        used = false;
    }
    if (used) {
        utils.logLabeledWarning("dataconnect", "CloudSQL no cost trial has already been used on this project.");
    }
    else {
        utils.logLabeledSuccess("dataconnect", "CloudSQL no cost trial available!");
    }
    return used;
}
exports.checkFreeTrialInstanceUsed = checkFreeTrialInstanceUsed;
function upgradeInstructions(projectId) {
    return `To provision a CloudSQL Postgres instance on the Firebase Data Connect no-cost trial:

  1. Please upgrade to the pay-as-you-go (Blaze) billing plan. Visit the following page:

      https://console.firebase.google.com/project/${projectId}/usage/details

  2. Run ${clc.bold("firebase deploy --only dataconnect")} to deploy your Data Connect service.`;
}
exports.upgradeInstructions = upgradeInstructions;
