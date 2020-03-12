import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";

export interface DatabaseInstance {
  // The globally unique name of the Database instance, e.g.
  // projects/999999999999/locations/us-central1/instances/red-ant
  name: string;
  // The parent project of the database instance, e.g. projects/999999999999
  project: string;
  // The url to access the database, e.g. https://red-ant.firebaseio.com
  databaseUrl: string;
  // The type of the database.
  type: string;
  // The current state of the database.
  state: string;
}

function _handleErrorResponse(response: any): any {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[firebasedatabase] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with firebase database.", {
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
  instanceName: string,
  location: string = "us-central1"
): Promise<DatabaseInstance> {
  const response = await api.request("POST", `/v1beta/projects/${projectNumber}/locations/${location}/instances?database_id=${instanceName}`, {
    auth: true,
    origin: api.firebaseDatabaseOrigin,
    json: {
      type: "USER_DATABASE",
    },
  });
  if (response.status === 200) {
    return response.body;
  }
  return _handleErrorResponse(response);
}

/**
 * Create a new Realtime Database instance
 * @param projectId Project from which you want to get the ruleset.
 * @param instanceName The name for the new Realtime Database instance.
 */
export async function listDatabaseInstances(projectNumber: number): Promise<DatabaseInstance[]> {
  const response = await api.request("GET", `/v1beta/projects/${projectNumber}/locations/-/instances`, {
    auth: true,
    origin: api.firebaseDatabaseOrigin,
  });
  if (response.status === 200) {
      // TODO: consider adding more information.
    return response.body.instances;
  }
  return _handleErrorResponse(response);
}
