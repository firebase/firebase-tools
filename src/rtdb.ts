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

import { Client } from "./apiv2";
import { DatabaseInstance, populateInstanceDetails } from "./management/database";
import { FirebaseError } from "./error";
import { realtimeOriginOrCustomUrl } from "./database/api";
import * as utils from "./utils";

/**
 * Updates rules, optionally specifying a dry run flag for validation purposes.
 */
export async function updateRules(
  projectId: string,
  instance: string,
  src: any,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const queryParams: { dryRun?: string } = {};
  if (options.dryRun) {
    queryParams.dryRun = "true";
  }
  const downstreamOptions: {
    instance: string;
    project: string;
    instanceDetails?: DatabaseInstance;
  } = { instance: instance, project: projectId };
  await populateInstanceDetails(downstreamOptions);
  if (!downstreamOptions.instanceDetails) {
    throw new FirebaseError(`Could not get instance details`, { exit: 2 });
  }
  const origin = utils.getDatabaseUrl(
    realtimeOriginOrCustomUrl(downstreamOptions.instanceDetails.databaseUrl),
    instance,
    ""
  );
  const client = new Client({ urlPrefix: origin });
  const response = await client.request<any, any>({
    method: "PUT",
    path: ".settings/rules.json",
    queryParams,
    body: src,
    resolveOnHTTPError: true,
  });
  if (response.status === 400) {
    throw new FirebaseError(`Syntax error in database rules:\n\n${response.body.error}`);
  } else if (response.status > 400) {
    throw new FirebaseError("Unexpected error while deploying database rules.", { exit: 2 });
  }
}
