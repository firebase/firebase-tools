"use strict";

const _ = require("lodash");
const clc = require("cli-color");
const opn = require("open");

const cloudbilling = require("../gcp/cloudbilling");
const { FirebaseError } = require("../error");
const logger = require("../logger");
const modsHelper = require("./modsHelper");
const prompt = require("../prompt");
const utils = require("../utils");

/**
 * Logs to console if setting up billing was successful.
 * @param {boolean} enabled
 * @param {string} projectId
 */
function _logBillingStatus(enabled, projectId) {
  return enabled
    ? utils.logLabeledSuccess(
        modsHelper.logPrefix,
        `${clc.bold(projectId)} has successfully been upgraded.`
      )
    : Promise.reject(
        new FirebaseError(
          `${modsHelper.logPrefix}: ${clc.bold(
            projectId
          )} could not be upgraded. Please add a billing account via the Firebase console before proceeding.`
        )
      );
}

/**
 * Opens URL if applicable and stalls until user responds.
 * @param {string} projectId
 * @param {string} url
 * @param {boolean} open
 * @return {Promise<undefined>}
 */
function _openBillingAccount(projectId, url, open) {
  if (open) {
    opn(url).catch((err) => {
      logger.debug("Unable to open billing URL: " + err.stack);
    });
  }

  return prompt
    .promptOnce({
      name: "continue",
      type: "confirm",
      message:
        "Press enter when finished upgrading your project to continue setting up your extension.",
      default: true,
    })
    .then(() => {
      return cloudbilling.checkBillingEnabled(projectId);
    });
}

/**
 * Question prompts user to select billing account for project.
 * @param {string} projectId
 * @param {string} modName
 * @param {Object<string, string>} accounts
 * @return {Promise<undefined>}
 */
function _chooseBillingAccount(projectId, modName, accounts) {
  const choices = _.map(accounts, "displayName");
  choices.push("Add new billing account");

  const question = {
    name: "billing",
    type: "list",
    message: `The mod ${clc.underline(
      modName
    )} requires your project to be upgraded to the Blaze plan. You have access to the following billing accounts.
Please select the one that you would like to associate with this project:`,
    choices: choices,
  };

  return prompt
    .promptOnce(question)
    .then((answer) => {
      if (answer === "Add new billing account") {
        const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
        return _openBillingAccount(projectId, billingURL, true);
      } else {
        const billingAccount = _.find(accounts, ["displayName", answer]);
        return cloudbilling.setBillingAccount(projectId, billingAccount.name);
      }
    })
    .then((enabled) => {
      return _logBillingStatus(enabled, projectId);
    });
}

/**
 * Directs user to set up billing account over the web and stalls until
 * user responds.
 * @param {string} projectId
 * @param {string} modName
 * @return {Promise<undefined>}
 */
function _setUpBillingAccount(projectId, modName) {
  const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;

  logger.info();
  logger.info(
    `The mod ${clc.bold(
      modName
    )} requires your project to be upgraded to the Blaze plan. Please visit the following link to add a billing account:`
  );
  logger.info();
  logger.info(clc.bold.underline(billingURL));
  logger.info();

  return prompt
    .promptOnce({
      name: "open-url",
      type: "confirm",
      message: "Press enter to open the URL.",
      default: true,
    })
    .then((open) => {
      return _openBillingAccount(projectId, billingURL, open);
    })
    .then((enabled) => {
      return _logBillingStatus(enabled, projectId);
    });
}

/**
 * Sets up billing if not enabled, otherwise silently continues.
 * @param {string} projectId
 * @param {string} modName
 * @param {boolean | undefined} required Whether billing is required
 * @return {Promise<undefined>}
 */
module.exports = function(projectId, modName, required) {
  if (!required) {
    return Promise.resolve();
  }

  return cloudbilling
    .checkBillingEnabled(projectId)
    .then((enabled) => {
      return enabled ? Promise.reject("billing enabled") : cloudbilling.listBillingAccounts();
    })
    .then((billingAccounts) => {
      if (billingAccounts) {
        const accounts = _.filter(billingAccounts, ["open", true]);

        return accounts.length > 0
          ? _chooseBillingAccount(projectId, modName, accounts)
          : _setUpBillingAccount(projectId, modName);
      }
    })
    .catch((err) => {
      if (err === "billing enabled") {
        return;
      }
      throw err;
    });
};
