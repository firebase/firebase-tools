/**
 * Functions for interacting with Realtime Database Management APIs.
 * Internal documentation: https://source.corp.google.com/piper///depot/google3/google/firebase/database/v1beta/rtdb_service.proto
 */

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";
import { previews } from "../previews";
import { FirebaseError } from "../error";
import { env } from "process";
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

export enum DatabaseLocation {
  US_CENTRAL1 = "us-central1",
  EUROPE_WEST1 = "europe-west1",
  ASIA_SOUTHEAST1 = "asia-southeast1",
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

/**
 * Create a new database instance.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 * @param location location for the project's instance.
 */
export async function createInstance(
  projectId: string,
  instanceName: string,
  location: DatabaseLocation
): Promise<DatabaseInstance> {
  try {
    const response = await api.request(
      "POST",
      `/${MGMT_API_VERSION}/projects/${projectId}/locations/${location}/instances?databaseId=${instanceName}`,
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
      `Failed to create instance: ${instanceName}. See firebase-debug.log for more details.`,
      {
        code: 2,
        original: err,
      }
    );
  }
}

/**
 * Returns the `DatabaseLocation` represented by the string.
 * @param location the location to parse.
 * @return the `DatabaseLocation`.
 */
export function parseDatabaseLocation(location?: string): DatabaseLocation {
  if (!location) {
    return DatabaseLocation.US_CENTRAL1;
  }
  switch (location.toLowerCase()) {
    case "europe-west1":
      return DatabaseLocation.EUROPE_WEST1;
    case "asia-southeast1":
      return DatabaseLocation.ASIA_SOUTHEAST1;
    case "us-central1":
    /* falls through */
    case "":
      return DatabaseLocation.US_CENTRAL1;
    default:
      throw new FirebaseError(
        `Unexpected location value: ${location}. Only us-central1, europe-west1, and asia-southeast1 locations are supported`
      );
  }
}
