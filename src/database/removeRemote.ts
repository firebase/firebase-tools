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
import { URL } from "url";
import { logger } from "../logger";
import * as utils from "../utils";

export interface RemoveRemote {
  /**
   * @param path the path to delete
   * @return false if the deleteion failed because the path exceeds the writeSizeLimit.
   */
  deletePath(path: string): Promise<boolean>;

  /**
   * @param path the path to delete subpaths from
   * @param subPaths the subpaths
   * @return false if the deleteion failed because the the total size of subpaths exceeds the writeSizeLimit.
   */
  deleteSubPath(path: string, subPaths: string[]): Promise<boolean>;
}

export class RTDBRemoveRemote implements RemoveRemote {
  private instance: string;
  private host: string;
  private apiClient: Client;

  constructor(instance: string, host: string) {
    this.instance = instance;
    this.host = host;

    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, "/"));
    this.apiClient = new Client({ urlPrefix: url.origin, auth: true });
  }

  deletePath(path: string): Promise<boolean> {
    return this.patch(path, null, "all data");
  }

  deleteSubPath(path: string, subPaths: string[]): Promise<boolean> {
    const body: any = {};
    for (const c of subPaths) {
      body[c] = null;
    }
    return this.patch(path, body, `${subPaths.length} subpaths`);
  }

  private async patch(path: string, body: any, note: string): Promise<boolean> {
    const t0 = Date.now();
    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, path + ".json"));
    const queryParams = { print: "silent", writeSizeLimit: "tiny" };
    const res = await this.apiClient.request({
      method: "PATCH",
      path: url.pathname,
      body,
      queryParams,
      responseType: "stream",
      resolveOnHTTPError: true,
    });
    const dt = Date.now() - t0;
    if (res.status >= 400) {
      logger.debug(
        `[database] Failed to remove ${note} at ${path} time: ${dt}ms, will try recursively chunked deletes.`
      );
      return false;
    }
    logger.debug(`[database] Sucessfully removed ${note} at ${path} time: ${dt}ms`);
    return true;
  }
}
