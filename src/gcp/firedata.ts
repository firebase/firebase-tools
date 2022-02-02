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
