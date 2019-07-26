import * as _ from "lodash";

import * as api from "./api";
import * as utils from "./utils";

const POLL_INTERVAL = 10000; // 10 seconds
const POLLS_BEFORE_RETRY = 12; // Retry enabling the API after 2 minutes

export async function check(
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean
): Promise<boolean> {
  const response = await api.request("GET", `/v1/projects/${projectId}/services/${apiName}`, {
    auth: true,
    origin: api.serviceUsageOrigin,
  });

  const isEnabled = _.get(response.body, "state") === "ENABLED";
  if (isEnabled && !silent) {
    utils.logLabeledSuccess(prefix, "all necessary APIs are enabled");
  }
  return isEnabled;
}

export async function enable(projectId: string, apiName: string): Promise<void> {
  return api.request("POST", `/v1/projects/${projectId}/services/${apiName}:enable`, {
    auth: true,
    origin: api.serviceUsageOrigin,
  });
}

export async function ensure(
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean
): Promise<void> {
  if (!silent) {
    utils.logLabeledBullet(prefix, "ensuring necessary APIs are enabled...");
  }
  const isEnabled = await check(projectId, apiName, prefix, silent);
  if (isEnabled) {
    return;
  }
  if (!silent) {
    utils.logLabeledWarning(prefix, "missing necessary APIs. Enabling now...");
  }
  return enableApiWithRetries(projectId, apiName, prefix, silent);
}

const pollCheckEnabled = async (
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean,
  enablementRetries: number,
  pollRetries = 0
): Promise<void> => {
  if (pollRetries > POLLS_BEFORE_RETRY) {
    return enableApiWithRetries(projectId, apiName, prefix, silent, enablementRetries + 1);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, POLL_INTERVAL);
  });
  const isEnabled = await check(projectId, apiName, prefix, silent);
  if (isEnabled) {
    return;
  }
  if (!silent) {
    utils.logLabeledBullet(prefix, "waiting for APIs to activate...");
  }
  return pollCheckEnabled(projectId, apiName, prefix, silent, enablementRetries, pollRetries + 1);
};

const enableApiWithRetries = async (
  projectId: string,
  apiName: string,
  prefix: string,
  silent: boolean,
  enablementRetries = 0
) => {
  if (enablementRetries > 1) {
    return utils.reject(
      "Timed out while waiting for APIs to enable. Please try again in a few minutes."
    );
  }
  await enable(projectId, apiName);
  return pollCheckEnabled(projectId, apiName, prefix, silent, enablementRetries);
};
