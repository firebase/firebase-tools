"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableBilling = void 0;
const clc = require("colorette");
const opn = require("open");
const cloudbilling = require("../gcp/cloudbilling");
const error_1 = require("../error");
const logger_1 = require("../logger");
const extensionsHelper_1 = require("./extensionsHelper");
const prompt = require("../prompt");
const utils = require("../utils");
const ADD_BILLING_ACCOUNT = "Add new billing account";
/**
 * Logs to console if setting up billing was successful.
 */
function logBillingStatus(enabled, projectId) {
    if (!enabled) {
        throw new error_1.FirebaseError(`${extensionsHelper_1.logPrefix}: ${clc.bold(projectId)} could not be upgraded. Please add a billing account via the Firebase console before proceeding.`);
    }
    utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `${clc.bold(projectId)} has successfully been upgraded.`);
}
/**
 * Opens URL if applicable and stalls until user responds.
 */
async function openBillingAccount(projectId, url, open) {
    if (open) {
        try {
            opn(url);
        }
        catch (err) {
            logger_1.logger.debug("Unable to open billing URL: " + err.stack);
        }
    }
    await prompt.confirm({
        message: "Press enter when finished upgrading your project to continue setting up your extension.",
        default: true,
    });
    return cloudbilling.checkBillingEnabled(projectId);
}
/**
 * Question prompts user to select billing account for project.
 */
async function chooseBillingAccount(projectId, accounts) {
    const choices = accounts.map((m) => m.displayName);
    choices.push(ADD_BILLING_ACCOUNT);
    const answer = await prompt.select({
        message: `Extensions require your project to be upgraded to the Blaze plan. You have access to the following billing accounts.
Please select the one that you would like to associate with this project:`,
        choices: choices,
    });
    let billingEnabled;
    if (answer === ADD_BILLING_ACCOUNT) {
        const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
        billingEnabled = await openBillingAccount(projectId, billingURL, true);
    }
    else {
        const billingAccount = accounts.find((a) => a.displayName === answer);
        billingEnabled = await cloudbilling.setBillingAccount(projectId, billingAccount.name);
    }
    return logBillingStatus(billingEnabled, projectId);
}
/**
 * Directs user to set up billing account over the web and stalls until
 * user responds.
 */
async function setUpBillingAccount(projectId) {
    const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
    logger_1.logger.info();
    logger_1.logger.info(`Extension require your project to be upgraded to the Blaze plan. Please visit the following link to add a billing account:`);
    logger_1.logger.info();
    logger_1.logger.info(clc.bold(clc.underline(billingURL)));
    logger_1.logger.info();
    const open = await prompt.confirm({
        message: "Press enter to open the URL.",
        default: true,
    });
    const billingEnabled = await openBillingAccount(projectId, billingURL, open);
    return logBillingStatus(billingEnabled, projectId);
}
/**
 * Sets up billing for the given project.
 * @param {string} projectId
 */
async function enableBilling(projectId) {
    const billingAccounts = await cloudbilling.listBillingAccounts();
    if (billingAccounts) {
        const accounts = billingAccounts.filter((account) => account.open);
        return accounts.length > 0
            ? chooseBillingAccount(projectId, accounts)
            : setUpBillingAccount(projectId);
    }
}
exports.enableBilling = enableBilling;
