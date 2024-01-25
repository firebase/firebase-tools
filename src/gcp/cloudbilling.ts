import { cloudbillingOrigin } from "../api";
import { Client } from "../apiv2";
import * as utils from "../utils";

const API_VERSION = "v1";
const client = new Client({ urlPrefix: cloudbillingOrigin, apiVersion: API_VERSION });

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
  const res = await client.get<{ billingEnabled: boolean }>(
    utils.endpoint(["projects", projectId, "billingInfo"]),
    { retryCodes: [500, 503] },
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
  billingAccountName: string,
): Promise<boolean> {
  const res = await client.put<{ billingAccountName: string }, { billingEnabled: boolean }>(
    utils.endpoint(["projects", projectId, "billingInfo"]),
    {
      billingAccountName: billingAccountName,
    },
    { retryCodes: [500, 503] },
  );
  return res.body.billingEnabled;
}

/**
 * Lists the billing accounts that the current authenticated user has permission to view.
 * @return {!Promise<Object[]>}
 */
export async function listBillingAccounts(): Promise<BillingAccount[]> {
  const res = await client.get<{ billingAccounts: BillingAccount[] }>(
    utils.endpoint(["billingAccounts"]),
    { retryCodes: [500, 503] },
  );
  return res.body.billingAccounts || [];
}
