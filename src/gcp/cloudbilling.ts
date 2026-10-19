import * as clc from "colorette";
import * as opn from "open";
import { cloudbillingOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { Setup } from "../init";
import { logger } from "../logger";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { ensure } from "../ensureApiEnabled";

const API_VERSION = "v1";
const client = new Client({ urlPrefix: cloudbillingOrigin(), apiVersion: API_VERSION });

export interface BillingAccount {
  name: string;
  open: string;
  displayName: string;
  masterBillingAccount: string;
}

/**
 * Returns whether or not project has billing enabled.
 * Cache the result in the init Setup metadata.
 * @param setup
 */
export async function isBillingEnabled(setup: Setup): Promise<boolean> {
  if (setup.isBillingEnabled !== undefined) {
    return setup.isBillingEnabled;
  }
  if (!setup.projectId) {
    return false;
  }
  setup.isBillingEnabled = await checkBillingEnabled(setup.projectId);
  return setup.isBillingEnabled;
}

const billingEnabledCache: Map<string, Promise<boolean>> = new Map();

/**
 * Reset the billing enabled cache.
 * @internal
 */
export function clearCache(): void {
  billingEnabledCache.clear();
}

/**
 * Returns whether or not project has billing enabled.
 * @param projectId The project ID.
 * @param forceRefresh Whether to force a refresh by bypassing the cache.
 */
export function checkBillingEnabled(projectId: string, forceRefresh = false): Promise<boolean> {
  if (!forceRefresh) {
    const cached = billingEnabledCache.get(projectId);
    if (cached !== undefined) {
      return cached;
    }
  }
  const promise = (async () => {
    await ensure(projectId, "cloudbilling.googleapis.com", "billing", true);
    const res = await client.get<{ billingEnabled: boolean }>(
      utils.endpoint(["projects", projectId, "billingInfo"]),
      {
        retries: 3,
        retryCodes: [429, 500, 503],
        headers: { "x-goog-user-project": projectId },
      },
    );
    return res.body.billingEnabled;
  })().catch((err) => {
    billingEnabledCache.delete(projectId);
    throw err;
  });

  billingEnabledCache.set(projectId, promise);
  return promise;
}

/**
 * Sets billing account for project and returns whether or not action was successful.
 * @param {string} projectId
 * @return {!Promise<boolean>}
 */
export async function setBillingAccount(
  projectId: string,
  billingAccountName: string,
): Promise<boolean> {
  await ensure(projectId, "cloudbilling.googleapis.com", "billing", true);
  const res = await client.put<{ billingAccountName: string }, { billingEnabled: boolean }>(
    utils.endpoint(["projects", projectId, "billingInfo"]),
    {
      billingAccountName: billingAccountName,
    },
    {
      retryCodes: [429, 500, 503],
      headers: { "x-goog-user-project": projectId },
    },
  );
  const enabled = res.body.billingEnabled;
  billingEnabledCache.set(projectId, Promise.resolve(enabled));
  return enabled;
}

/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<object[]>}
 */
export async function listBillingAccounts(projectId?: string): Promise<BillingAccount[]> {
  if (projectId) {
    await ensure(projectId, "cloudbilling.googleapis.com", "billing", true);
  }
  const res = await client.get<{ billingAccounts: BillingAccount[] }>(
    utils.endpoint(["billingAccounts"]),
    {
      retryCodes: [429, 500, 503],
      headers: projectId ? { "x-goog-user-project": projectId } : undefined,
    },
  );
  return res.body.billingAccounts || [];
}

const ADD_BILLING_ACCOUNT = "Add new billing account";

/**
 * Logs to console if setting up billing was successful.
 */
function logBillingStatus(enabled: boolean, projectId: string, featureName: string): void {
  const prefix = featureName === "Extensions" ? "extensions" : featureName.toLowerCase();
  if (!enabled) {
    throw new FirebaseError(
      `${prefix}: ${clc.bold(
        projectId,
      )} could not be upgraded. Please add a billing account via the Firebase console before proceeding.`,
    );
  }
  utils.logLabeledSuccess(prefix, `${clc.bold(projectId)} has successfully been upgraded.`);
}

/**
 * Opens URL if applicable and stalls until user responds.
 */
async function openBillingAccount(
  projectId: string,
  url: string,
  open: boolean,
  featureName = "Extensions",
): Promise<boolean> {
  if (open) {
    try {
      opn(url);
    } catch (err: any) {
      logger.debug("Unable to open billing URL: " + err.stack);
    }
  }

  const target = featureName === "Extensions" ? "your extension" : featureName.toLowerCase();
  await prompt.confirm({
    message: `Press enter when finished upgrading your project to continue setting up ${target}.`,
    default: true,
  });
  return exports.checkBillingEnabled(projectId, true);
}

/**
 * Question prompts user to select billing account for project.
 */
async function chooseBillingAccount(
  projectId: string,
  accounts: BillingAccount[],
  featureName: string,
): Promise<void> {
  const choices = accounts.map((m) => m.displayName);
  choices.push(ADD_BILLING_ACCOUNT);

  const verb = featureName === "Extensions" ? "require" : "requires";
  const answer = await prompt.select({
    message: `${featureName} ${verb} your project to be upgraded to the Blaze plan. You have access to the following billing accounts.
Please select the one that you would like to associate with this project:`,
    choices: choices,
  });

  let billingEnabled: boolean;
  if (answer === ADD_BILLING_ACCOUNT) {
    const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
    billingEnabled = await openBillingAccount(projectId, billingURL, true, featureName);
  } else {
    const billingAccount = accounts.find((a) => a.displayName === answer);
    billingEnabled = await exports.setBillingAccount(projectId, billingAccount!.name);
  }

  return logBillingStatus(billingEnabled, projectId, featureName);
}

/**
 * Directs user to set up billing account over the web and stalls until
 * user responds.
 */
async function setUpBillingAccount(projectId: string, featureName: string) {
  const billingURL = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
  const verb = featureName === "Extensions" ? "require" : "requires";

  logger.info();
  logger.info(
    `${featureName} ${verb} your project to be upgraded to the Blaze plan. Please visit the following link to add a billing account:`,
  );
  logger.info();
  logger.info(clc.bold(clc.underline(billingURL)));
  logger.info();

  const open = await prompt.confirm({
    message: "Press enter to open the URL.",
    default: true,
  });
  const billingEnabled = await openBillingAccount(projectId, billingURL, open, featureName);
  return logBillingStatus(billingEnabled, projectId, featureName);
}

/**
 * Sets up billing for the given project.
 * @param {string} projectId
 * @param {string} featureName
 */
export async function enableBilling(projectId: string, featureName = "Extensions"): Promise<void> {
  const billingAccounts = await exports.listBillingAccounts(projectId);
  if (billingAccounts) {
    const accounts = billingAccounts.filter((account: BillingAccount) => account.open);
    return accounts.length > 0
      ? chooseBillingAccount(projectId, accounts, featureName)
      : setUpBillingAccount(projectId, featureName);
  }
}
