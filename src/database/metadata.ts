/**
 * Package for interacting with Realtime Database metadata.
 */

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";

function handleErrorResponse(response: any): any {
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
export interface ListRulesetItem {
  id: RulesetId;
}
export interface LabelIds {
  stable: RulesetId;
  canary?: RulesetId;
}

export async function listAllRulesets(databaseName: string): Promise<ListRulesetItem[]> {
  const response = await api.request("GET", `/namespaces/${databaseName}/rulesets`, {
    auth: true,
    origin: api.rtdbMetadataOrigin,
  });
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}

export async function getRuleset(databaseName: string, rulesetId: string): Promise<RulesetSource> {
  const response = await api.request("GET", `/namespaces/${databaseName}/rulesets/${rulesetId}`, {
    auth: true,
    origin: api.rtdbMetadataOrigin,
  });
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}

export async function getRulesetLabels(databaseName: string): Promise<LabelIds> {
  const response = await api.request("GET", `/namespaces/${databaseName}/ruleset_labels`, {
    auth: true,
    origin: api.rtdbMetadataOrigin,
  });
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}
