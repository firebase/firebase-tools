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

import { Client } from "../apiv2";
import { identityOrigin } from "../api";

const apiClient = new Client({ urlPrefix: identityOrigin, auth: true });

/**
 * Returns the list of authorized domains.
 * @param project project identifier.
 * @return authorized domains.
 */
export async function getAuthDomains(project: string): Promise<string[]> {
  const res = await apiClient.get<{ authorizedDomains: string[] }>(
    `/admin/v2/projects/${project}/config`
  );
  return res.body.authorizedDomains;
}

/**
 * Updates the list of authorized domains.
 * @param project project identifier.
 * @param authDomains full list of authorized domains.
 * @return authorized domains.
 */
export async function updateAuthDomains(project: string, authDomains: string[]): Promise<string[]> {
  const res = await apiClient.patch<
    { authorizedDomains: string[] },
    { authorizedDomains: string[] }
  >(
    `/admin/v2/projects/${project}/config`,
    { authorizedDomains: authDomains },
    { queryParams: { update_mask: "authorizedDomains" } }
  );
  return res.body.authorizedDomains;
}
