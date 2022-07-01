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

import { firedataOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import * as utils from "../utils";

export interface DatabaseInstance {
  // The globally unique name of the Database instance.
  // Required to be URL safe.  ex: 'red-ant'
  instance: string;
}

function _handleErrorResponse(response: any): any {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[firedata] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with FireData.", {
    code: 2,
  });
}

/**
 * List Realtime Database instances
 * @param projectNumber Project from which you want to list databases.
 * @return the list of databases.
 */
export async function listDatabaseInstances(projectNumber: string): Promise<DatabaseInstance[]> {
  const client = new Client({ urlPrefix: firedataOrigin, apiVersion: "v1" });
  const response = await client.get<{ instance: DatabaseInstance[] }>(
    `/projects/${projectNumber}/databases`,
    {
      resolveOnHTTPError: true,
    }
  );
  if (response.status === 200) {
    return response.body.instance;
  }
  return _handleErrorResponse(response);
}
