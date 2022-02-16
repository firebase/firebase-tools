import * as api from "../api";
import * as utils from "../utils";

const API_VERSION = "v1";

export interface BillingAccount {
  name: string;
  open: string;
  displayName: string;
  masterBillingAccount: string;
}
/**
 * Returns whether or not project has billing enabled.
 * @param projectId
 */
export async function checkBillingEnabled(projectId: string): Promise<boolean> {
  const res = await api.request(
    "GET",
    utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]),
    {
      auth: true,
      origin: api.cloudbillingOrigin,
      retryCodes: [500, 503],
    }
  );
  return res.body.billingEnabled;
}

/**
 * Sets billing account for project and returns whether or not action was successful.
 * @param {string} projectId
 * @return {!Promise<boolean>}
 */
export async function setBillingAccount(
  projectId: string,
  billingAccountName: string
): Promise<boolean> {
  const res = await api.request(
    "PUT",
    utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]),
    {
      auth: true,
      origin: api.cloudbillingOrigin,
      retryCodes: [500, 503],
      data: {
        billingAccountName: billingAccountName,
      },
    }
  );
  return res.body.billingEnabled;
}

/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<Object[]>}
 */
export async function listBillingAccounts(): Promise<BillingAccount[]> {
  const res = await api.request("GET", utils.endpoint([API_VERSION, "billingAccounts"]), {
    auth: true,
    origin: api.cloudbillingOrigin,
    retryCodes: [500, 503],
  });
  return res.body.billingAccounts || [];
}
