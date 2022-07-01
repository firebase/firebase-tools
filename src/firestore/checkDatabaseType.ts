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

import { appengineOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";

/**
 * Determine the Firestore database type for a given project. One of:
 *   - DATABASE_TYPE_UNSPECIFIED (unspecified)
 *   - CLOUD_DATASTORE (Datastore legacy)
 *   - CLOUD_FIRESTORE (Firestore native mode)
 *   - CLOUD_DATASTORE_COMPATIBILITY (Firestore datastore mode)
 *
 * @param projectId the Firebase project ID.
 */
export async function checkDatabaseType(projectId: string): Promise<string | undefined> {
  try {
    const client = new Client({ urlPrefix: appengineOrigin, apiVersion: "v1" });
    const resp = await client.get<{ databaseType?: string }>(`/apps/${projectId}`);
    return resp.body.databaseType;
  } catch (err: any) {
    logger.debug("error getting database type", err);
    return undefined;
  }
}
