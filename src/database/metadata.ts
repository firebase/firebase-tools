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

export interface ListRulesetItem {
  id: string;
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
