import * as clc from "colorette";
import * as opn from "open";

import * as cloudbilling from "../gcp/cloudbilling";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { logPrefix } from "./extensionsHelper";
import * as prompt from "../prompt";
import * as utils from "../utils";

const ADD_BILLING_ACCOUNT = "Add new billing account";
/**
 * Logs to console if setting up billing was successful.
 */
function logBillingStatus(enabled: boolean, projectId: string): void {
  if (!enabled) {
    throw new FirebaseError(
      `${logPrefix}: ${clc.bold(
        projectId,
      )} could not be upgraded. Please add a billing account via the Firebase console before proceeding.`,
    );
  }
  utils.logLabeledSuccess(logPrefix, `${clc.bold(projectId)} has successfully been upgraded.`);
}

/**
 * Opens URL if applicable and stalls until user responds.
 */
async function openBillingAccount(projectId: string, url: string, open: boolean): Promise<boolean> {
  if (open) {
    try {
      opn(url);
    } catch (err: any) {
      logger.debug("Unable to open billing URL: " + err.stack);
    }
  }

  await prompt.promptOnce({
    name: "continue",
    type: "confirm",
    message:
      "Press enter when finished upgrading your project to continue setting up your extension.",
    default: true,
  });
  return cloudbilling.checkBillingEnabled(projectId);
}

/**
 * Question prompts user to select billing account for project.
 */
async function chooseBillingAccount(
  projectId: string,
  accounts: cloudbilling.BillingAccount[],
): Promise<void> {
  const choices = accounts.map((m) => m.displayName);
  choices.push(ADD_BILLING_ACCOUNT);

  const answer = await prompt.promptOnce({
    name: "billing",
    type: "list",
    message: `Extensions require your project to be upgraded to the Blaze plan. You have access to the following billing accounts.
Please select the one that you would like to associate with this project:`,
    choices: choices,
  });

  let billingEnabled: boolean;
  if (answer === ADD_BILLING_ACCOUNT) {
    const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
    billingEnabled = await openBillingAccount(projectId, billingURL, true);
  } else {
    const billingAccount = accounts.find((a) => a.displayName === answer);
    billingEnabled = await cloudbilling.setBillingAccount(projectId, billingAccount!.name);
  }

  return logBillingStatus(billingEnabled, projectId);
}

/**
 * Directs user to set up billing account over the web and stalls until
 * user responds.
 */
async function setUpBillingAccount(projectId: string) {
  const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;

  logger.info();
  logger.info(
    `Extension require your project to be upgraded to the Blaze plan. Please visit the following link to add a billing account:`,
  );
  logger.info();
  logger.info(clc.bold(clc.underline(billingURL)));
  logger.info();

  const open = await prompt.promptOnce({
    name: "open-url",
    type: "confirm",
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
export async function enableBilling(projectId: string): Promise<void> {
  const billingAccounts = await cloudbilling.listBillingAccounts();
  if (billingAccounts) {
    const accounts = billingAccounts.filter((account) => account.open);
    return accounts.length > 0
      ? chooseBillingAccount(projectId, accounts)
      : setUpBillingAccount(projectId);
  }
}
