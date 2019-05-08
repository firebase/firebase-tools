import * as _ from "lodash";

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";

const API_VERSION = "v1";

function _handleErrorResponse(response: any): any {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with rules.", {
    code: 2,
  });
}

/**
 * Create a new Realtime Database instance
 * @param projectId Project from which you want to get the ruleset.
 * @param instanceName The name for the new Realtime Database instance.
 */
export async function createDatabaseInstance(projectNumber: any, instanceName: any): Promise<any> {
  const response = await api.request("POST", `/v1/projects/${projectNumber}/databases`, {
    auth: true,
    origin: api.firedataOrigin,
    json: {
      instance: instanceName,
    },
  });
  return response.body.instance;
}
