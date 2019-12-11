/**
 * Package for interacting with Realtime Database metadata.
 */

import * as api from "../api";
import * as logger from "../logger";
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

export async function listAllRulesets(databaseName: string): Promise<Ruleset[]> {
  const response = await api.request("GET", `/namespaces/${databaseName}/rulesets`, {
    auth: true,
    origin: api.rtdbMetadataOrigin,
    json: true,
  });
  if (response.status === 200) {
    return response.body.rulesets;
  }
  return handleErrorResponse(response);
}

export async function getRuleset(databaseName: string, rulesetId: string): Promise<Ruleset> {
  const response = await api.request("GET", `/namespaces/${databaseName}/rulesets/${rulesetId}`, {
    auth: true,
    origin: api.rtdbMetadataOrigin,
    json: true,
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

export async function createRuleset(
  databaseName: string,
  source: RulesetSource
): Promise<RulesetId> {
  const response = await api.request("POST", `/.settings/rulesets.json`, {
    auth: true,
    origin: utils.addSubdomain(api.realtimeOrigin, databaseName),
    json: false,
    data: source,
  });
  if (response.status === 200) {
    return JSON.parse(response.body).id;
  }
  return handleErrorResponse(response);
}

export async function setRulesetLabels(databaseName: string, labels: LabelIds): Promise<void> {
  const response = await api.request("PUT", `/.settings/ruleset_labels.json`, {
    auth: true,
    origin: utils.addSubdomain(api.realtimeOrigin, databaseName),
    data: labels,
  });
  if (response.status === 200) {
    return response.body;
  }
  return handleErrorResponse(response);
}
