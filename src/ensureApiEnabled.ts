import { bold } from "colorette";

import { trackGA4 } from "./track";
import { serviceUsageOrigin } from "./api";
import { Client } from "./apiv2";
import * as utils from "./utils";
import { FirebaseError, isBillingError } from "./error";

export const POLL_SETTINGS = {
  pollInterval: 10000,
  pollsBeforeRetry: 12,
};

const apiClient = new Client({
  urlPrefix: serviceUsageOrigin,
  apiVersion: "v1",
});

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
  silent = false,
): Promise<boolean> {
  const res = await apiClient.get<{ state: string }>(`/projects/${projectId}/services/${apiName}`, {
    headers: { "x-goog-quota-user": `projects/${projectId}` },
    skipLog: { resBody: true },
  });
  const isEnabled = res.body.state === "ENABLED";
  if (isEnabled && !silent) {
    utils.logLabeledSuccess(prefix, `required API ${bold(apiName)} is enabled`);
  }
  return isEnabled;
}

function isPermissionError(e: { context?: { body?: { error?: { status?: string } } } }): boolean {
  return e.context?.body?.error?.status === "PERMISSION_DENIED";
}

/**
 * Attempt to enable an API on the specified project (just once).
 *
 * If enabling an API for a customer, prefer `ensure` which will check for the
 * API first, which is a seperate permission than enabling.
 *
 * @param projectId The project in which to enable the API.
 * @param apiName The name of the API e.g. `someapi.googleapis.com`.
 */
async function enable(projectId: string, apiName: string): Promise<void> {
  try {
    await apiClient.post<undefined, unknown>(
      `/projects/${projectId}/services/${apiName}:enable`,
      undefined,
      {
        headers: { "x-goog-quota-user": `projects/${projectId}` },
        skipLog: { resBody: true },
      },
    );
  } catch (err: any) {
    if (isBillingError(err)) {
      throw new FirebaseError(`Your project ${bold(
        projectId,
      )} must be on the Blaze (pay-as-you-go) plan to complete this command. Required API ${bold(
        apiName,
      )} can't be enabled until the upgrade is complete. To upgrade, visit the following URL:

https://console.firebase.google.com/project/${projectId}/usage/details`);
    } else if (isPermissionError(err)) {
      const apiPermissionDeniedRegex = new RegExp(
        /Permission denied to enable service \[([.a-zA-Z]+)\]/,
      );
      // Recognize permission denied errors on APIs and provide users the
      // GCP console link to easily enable the API.
      const permissionsError = apiPermissionDeniedRegex.exec((err as Error).message);
      if (permissionsError && permissionsError[1]) {
        const serviceUrl = permissionsError[1];
        // Expand the error message instead of creating a new error so that
        // all the other error properties (status, context, etc) are passed
        // downstream to anything that uses them.
        (err as Error).message = `Permissions denied enabling ${serviceUrl}.
        Please ask a project owner to visit the following URL to enable this service:
        
        https://console.cloud.google.com/apis/library/${serviceUrl}?project=${projectId}`;
        throw err;
      } else {
        // Regex failed somehow - show the raw permissions error.
        throw err;
      }
    } else {
      throw err;
    }
  }
}

async function pollCheckEnabled(
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean,
  enablementRetries: number,
  pollRetries = 0,
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
    void trackGA4("api_enabled", {
      api_name: apiName,
    });
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
  enablementRetries = 0,
): Promise<void> {
  if (enablementRetries > 1) {
    throw new FirebaseError(
      `Timed out waiting for API ${bold(apiName)} to enable. Please try again in a few minutes.`,
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
  silent = false,
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

/**
 * Returns a link to enable an API on a project in Cloud console. This can be used instead of ensure
 * in contexts where automatically enabling APIs is not desirable (ie emulator commands).
 *
 * @param projectId The project to generate an API enablement link for
 * @param apiName  The name of the API e.g. `someapi.googleapis.com`.
 * @return A link to Cloud console to enable the API
 */
export function enableApiURI(projectId: string, apiName: string): string {
  return `https://console.cloud.google.com/apis/library/${apiName}?project=${projectId}`;
}
