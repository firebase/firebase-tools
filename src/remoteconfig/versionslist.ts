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
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";
import { logger } from "../logger";

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin,
  apiVersion: "v1",
});

const TIMEOUT = 30000;

/**
 * Get a list of Remote Config template versions that have been published, sorted in reverse chronological order for a specific project
 * @param projectId Input is the Project ID string
 * @param maxResults The maximum number of items to return per page
 * @return {Promise<ListVersionsResult>} Returns a Promise of a list of Remote Config template versions that have been published
 */
export async function getVersions(projectId: string, maxResults = 10): Promise<ListVersionsResult> {
  maxResults = maxResults || 300;
  try {
    const params = new URLSearchParams();
    if (maxResults) {
      params.set("pageSize", `${maxResults}`);
    }
    const response = await apiClient.request<void, ListVersionsResult>({
      method: "GET",
      path: `/projects/${projectId}/remoteConfig:listVersions`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Remote Config template versions for Firebase project ${projectId}. `,
      { original: err }
    );
  }
}
