/**
 * Functions for interacting with Realtime Database Management APIs.
 */

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";
import { previews } from "../previews";
const MGMT_API_VERSION = "v1beta";
const TIMEOUT_MILLIS = 10000;

export enum DatabaseInstanceType {
  DATABASE_INSTANCE_TYPE_UNSPECIFIED = "unspecified",
  DEFAULT_DATABASE = "default",
  USER_DATABASE = "user",
}

export enum DatabaseInstanceState {
  LIFECYCLE_STATE_UNSPECIFIED = "unspecified",
  ACTIVE = "active",
  DISABLED = "disabled",
  DELETED = "deleted",
}

export interface DatabaseInstance {
  name: string;
  project: string;
  databaseUrl: string;
  type: DatabaseInstanceType;
  state: DatabaseInstanceState;
}

/**
 * Populate instanceDetails in commandOptions.
 * @param options command options that will be modified to add instanceDetails.
 */
export async function populateInstanceDetails(options: any): Promise<void> {
  if (previews.rtdbmanagement) {
    options.instanceDetails = await getDatabaseInstanceDetails(options.project, options.instance);
  }
  return Promise.resolve();
}

/**
 * Get details for a Realtime Database instance from the management API.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 */
export async function getDatabaseInstanceDetails(
  projectId: string,
  instanceName: string
): Promise<DatabaseInstance> {
  try {
    const response = await api.request(
      "GET",
      `/${MGMT_API_VERSION}/projects/${projectId}/locations/-/instances/${instanceName}`,
      {
        auth: true,
        origin: api.rtdbManagementOrigin,
        timeout: TIMEOUT_MILLIS,
      }
    );

    return response.body;
  } catch (err) {
    logger.debug(err.message);
    return utils.reject(
      `Failed to get instance details for instance: ${instanceName}. See firebase-debug.log for more details.`,
      {
        code: 2,
        original: err,
      }
    );
  }
}
