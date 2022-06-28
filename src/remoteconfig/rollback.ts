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

import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { RemoteConfigTemplate } from "./interfaces";

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin,
  apiVersion: "v1",
});

const TIMEOUT = 30000;

/**
 * Rolls back to a specific version of the Remote Config template
 * @param projectId Remote Config Template Project Id
 * @param versionNumber Remote Config Template version number to roll back to
 * @return Returns a promise of a Remote Config Template using the RemoteConfigTemplate interface
 */
export async function rollbackTemplate(
  projectId: string,
  versionNumber?: number
): Promise<RemoteConfigTemplate> {
  const params = new URLSearchParams();
  params.set("versionNumber", `${versionNumber}`);
  const res = await apiClient.request<void, RemoteConfigTemplate>({
    method: "POST",
    path: `/projects/${projectId}/remoteConfig:rollback`,
    queryParams: params,
    timeout: TIMEOUT,
  });
  return res.body;
}
