/**
 * Package for interacting with Realtime Database Management APIs.
 */

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";
import { FirebaseError } from "../error";
const MGMT_API_VERSION = "v1beta";
const TIMEOUT_MILLIS = 10000;
const RTDB_INSTANCE_LIST_PAGE_SIZE = 100;

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

export async function requireInstanceDetails(options: any): Promise<void> {
  return getDatabaseInstanceDetails(options.projectId, options.instance).then((details) => {
    options.instanceDetails = details;
  });
}

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
      `Error while getting instance details for instance: ${instanceName}. See firebase-debug.log for more details.`,
      {
        code: 2,
        original: err,
      }
    );
  }
}
