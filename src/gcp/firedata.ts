import * as api from "../api";
import * as logger from "../logger";
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
 * Create a new Realtime Database instance
 * @param projectId Project from which you want to get the ruleset.
 * @param instanceName The name for the new Realtime Database instance.
 */
export async function createDatabaseInstance(
  projectNumber: number,
  instanceName: string
): Promise<any> {
  const response = await api.request("POST", `/v1/projects/${projectNumber}/databases`, {
    auth: true,
    origin: api.firedataOrigin,
    json: {
      instance: instanceName,
    },
  });
  if (response.status === 200) {
    return response.body.instance;
  }
  return _handleErrorResponse(response);
}

/**
 * Create a new Realtime Database instance
 * @param projectId Project from which you want to get the ruleset.
 * @param instanceName The name for the new Realtime Database instance.
 */
export async function listDatabaseInstances(projectNumber: number): Promise<DatabaseInstance[]> {
  const response = await api.request("GET", `/v1/projects/${projectNumber}/databases`, {
    auth: true,
    origin: api.firedataOrigin,
  });
  if (response.status === 200) {
    return response.body.instance;
  }
  return _handleErrorResponse(response);
}
