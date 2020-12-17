import * as _ from "lodash";
import { bold } from "cli-color";

import * as track from "./track";
import * as api from "./api";
import * as utils from "./utils";
import { FirebaseError, isBillingError } from "./error";

export const POLL_SETTINGS = {
  pollInterval: 10000,
  pollsBeforeRetry: 12,
};

/**
 * Check if the specified API is enabled.
 * @param projectId The project on which to check enablement.
 * @param apiName The name of the API e.g. `someapi.googleapis.com`.
 * @param prefix The logging prefix to use when printing messages about enablement.
 * @param silent Whether or not to print log messages.
 */
export async function check(
  projectId: string,
  apiName: string,
  prefix: string,
  silent = false
): Promise<boolean> {
  const response = await api.request("GET", `/v1/projects/${projectId}/services/${apiName}`, {
    auth: true,
    origin: api.serviceUsageOrigin,
  });

  const isEnabled = _.get(response.body, "state") === "ENABLED";
  if (isEnabled && !silent) {
    utils.logLabeledSuccess(prefix, `required API ${bold(apiName)} is enabled`);
  }
  return isEnabled;
}

/**
 * Attempt to enable an API on the specified project (just once).
 *
 * @param projectId The project in which to enable the API.
 * @param apiName The name of the API e.g. `someapi.googleapis.com`.
 */
export async function enable(projectId: string, apiName: string): Promise<void> {
  try {
    await api.request("POST", `/v1/projects/${projectId}/services/${apiName}:enable`, {
      auth: true,
      origin: api.serviceUsageOrigin,
    });
  } catch (err) {
    if (isBillingError(err)) {
      throw new FirebaseError(`Your project ${bold(
        projectId
      )} must be on the Blaze (pay-as-you-go) plan to complete this command. Required API ${bold(
        apiName
      )} can't be enabled until the upgrade is complete. To upgrade, visit the following URL:

https://console.firebase.google.com/project/${projectId}/usage/details`);
    }
    throw err;
  }
}

async function pollCheckEnabled(
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean,
  enablementRetries: number,
  pollRetries = 0
): Promise<void> {
  if (pollRetries > POLL_SETTINGS.pollsBeforeRetry) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return enableApiWithRetries(projectId, apiName, prefix, silent, enablementRetries + 1);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, POLL_SETTINGS.pollInterval);
  });
  const isEnabled = await check(projectId, apiName, prefix, silent);
  if (isEnabled) {
    track("api_enabled", apiName);
    return;
  }
  if (!silent) {
    utils.logLabeledBullet(prefix, `waiting for API ${bold(apiName)} to activate...`);
  }
  return pollCheckEnabled(projectId, apiName, prefix, silent, enablementRetries, pollRetries + 1);
}

async function enableApiWithRetries(
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean,
  enablementRetries = 0
): Promise<void> {
  if (enablementRetries > 1) {
    throw new FirebaseError(
      `Timed out waiting for API ${bold(apiName)} to enable. Please try again in a few minutes.`
    );
  }
  await enable(projectId, apiName);
  return pollCheckEnabled(projectId, apiName, prefix, silent, enablementRetries);
}

/**
 * Check if an API is enabled on a project, try to enable it if not with polling and retries.
 *
 * @param projectId The project on which to check enablement.
 * @param apiName The name of the API e.g. `someapi.googleapis.com`.
 * @param prefix The logging prefix to use when printing messages about enablement.
 * @param silent Whether or not to print log messages.
 */
export async function ensure(
  projectId: string,
  apiName: string,
  prefix: string,
  silent = false
): Promise<void> {
  if (!silent) {
    utils.logLabeledBullet(prefix, `ensuring required API ${bold(apiName)} is enabled...`);
  }
  const isEnabled = await check(projectId, apiName, prefix, silent);
  if (isEnabled) {
    return;
  }
  if (!silent) {
    utils.logLabeledWarning(prefix, `missing required API ${bold(apiName)}. Enabling now...`);
  }
  return enableApiWithRetries(projectId, apiName, prefix, silent);
}
