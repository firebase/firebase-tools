/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
    { retryCodes: [500, 503] }
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
  const res = await client.put<{ billingAccountName: string }, { billingEnabled: boolean }>(
    utils.endpoint(["projects", projectId, "billingInfo"]),
    {
      billingAccountName: billingAccountName,
    },
    { retryCodes: [500, 503] }
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
    { retryCodes: [500, 503] }
  );
  return res.body.billingAccounts || [];
}
