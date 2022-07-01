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

/**
 * Package for interacting with Realtime Database metadata.
 */

import { realtimeOrigin, rtdbMetadataOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import * as utils from "../utils";

function handleErrorResponse(response: any): Promise<any> {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with database.", {
    code: 2,
  });
}

export type RulesetSource = string;
export type RulesetId = string;
export interface LabelIds {
  stable?: RulesetId;
  canary?: RulesetId;
}

export interface Ruleset {
  id: RulesetId;
  createdAt: string;
  source: RulesetSource;
}

const apiClient = new Client({ urlPrefix: rtdbMetadataOrigin });

export async function listAllRulesets(databaseName: string): Promise<Ruleset[]> {
  const response = await apiClient.get<{ rulesets: Ruleset[] }>(
    `/namespaces/${databaseName}/rulesets`,
    { resolveOnHTTPError: true }
  );
  if (response.status === 200) {
    return response.body.rulesets;
  }
  return handleErrorResponse(response);
}

export async function getRuleset(databaseName: string, rulesetId: string): Promise<Ruleset> {
  const response = await apiClient.get<Ruleset>(
    `/namespaces/${databaseName}/rulesets/${rulesetId}`,
    { resolveOnHTTPError: true }
  );
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}

export async function getRulesetLabels(databaseName: string): Promise<LabelIds> {
  const response = await apiClient.get<LabelIds>(`/namespaces/${databaseName}/ruleset_labels`, {
    resolveOnHTTPError: true,
  });
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}

export async function createRuleset(
  databaseName: string,
  source: RulesetSource
): Promise<RulesetId> {
  const localApiClient = new Client({
    urlPrefix: utils.addSubdomain(realtimeOrigin, databaseName),
  });
  const response = await localApiClient.post<RulesetSource, { id: RulesetId }>(
    `/.settings/rulesets.json`,
    source,
    { resolveOnHTTPError: true }
  );
  if (response.status === 200) {
    return response.body.id;
  }
  return handleErrorResponse(response);
}

export async function setRulesetLabels(databaseName: string, labels: LabelIds): Promise<void> {
  const localApiClient = new Client({
    urlPrefix: utils.addSubdomain(realtimeOrigin, databaseName),
  });
  const response = await localApiClient.put<LabelIds, void>(
    `/.settings/ruleset_labels.json`,
    labels,
    {
      resolveOnHTTPError: true,
    }
  );
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}
