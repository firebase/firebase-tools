import { cloudbillingOrigin } from "../api";
import { Client } from "../apiv2";
import { Setup } from "../init";
import * as utils from "../utils";

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
  const promise = client
    .get<{ billingEnabled: boolean }>(utils.endpoint(["projects", projectId, "billingInfo"]), {
      retries: 3,
      retryCodes: [429, 500, 503],
    })
    .then((res) => res.body.billingEnabled)
    .catch((err) => {
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
  const res = await client.put<{ billingAccountName: string }, { billingEnabled: boolean }>(
    utils.endpoint(["projects", projectId, "billingInfo"]),
    {
      billingAccountName: billingAccountName,
    },
    { retryCodes: [429, 500, 503] },
  );
  const enabled = res.body.billingEnabled;
  billingEnabledCache.set(projectId, Promise.resolve(enabled));
  return enabled;
}

/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<Object[]>}
 */
export async function listBillingAccounts(): Promise<BillingAccount[]> {
  const res = await client.get<{ billingAccounts: BillingAccount[] }>(
    utils.endpoint(["billingAccounts"]),
    { retryCodes: [429, 500, 503] },
  );
  return res.body.billingAccounts || [];
}
