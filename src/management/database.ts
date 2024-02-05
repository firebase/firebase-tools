/**
 * Functions for interacting with Realtime Database Management APIs.
 * Internal documentation: https://source.corp.google.com/piper///depot/google3/google/firebase/database/v1beta/rtdb_service.proto
 */

import { Client } from "../apiv2";
import { Constants } from "../emulator/constants";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { rtdbManagementOrigin } from "../api";
import * as utils from "../utils";

export const MGMT_API_VERSION = "v1beta";
export const APP_LIST_PAGE_SIZE = 100;
const TIMEOUT_MILLIS = 10000;
const INSTANCE_RESOURCE_NAME_REGEX = /projects\/([^/]+?)\/locations\/([^/]+?)\/instances\/([^/]*)/;

export enum DatabaseInstanceType {
  DATABASE_INSTANCE_TYPE_UNSPECIFIED = "unspecified",
  DEFAULT_DATABASE = "default_database",
  USER_DATABASE = "user_database",
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
  ANY = "-",
}

export interface DatabaseInstance {
  name: string;
  project: string;
  databaseUrl: string;
  location: DatabaseLocation;
  type: DatabaseInstanceType;
  state: DatabaseInstanceState;
}

const apiClient = new Client({ urlPrefix: rtdbManagementOrigin, apiVersion: MGMT_API_VERSION });

/**
 * Populate instanceDetails in commandOptions.
 * @param options command options that will be modified to add instanceDetails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function populateInstanceDetails(options: any): Promise<void> {
  options.instanceDetails = await getDatabaseInstanceDetails(options.project, options.instance);
  return Promise.resolve();
}

/**
 * Get details for a Realtime Database instance from the management API.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 */
export async function getDatabaseInstanceDetails(
  projectId: string,
  instanceName: string,
): Promise<DatabaseInstance> {
  try {
    const response = await apiClient.request({
      method: "GET",
      path: `/projects/${projectId}/locations/-/instances/${instanceName}`,
      timeout: TIMEOUT_MILLIS,
    });
    return convertDatabaseInstance(response.body);
  } catch (err: any) {
    logger.debug(err.message);
    const emulatorHost = process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST];
    if (emulatorHost) {
      // if the call failed due to some reason, and we're talking to the emulator,
      // return a reasonable default and swallow the error.
      return Promise.resolve({
        name: instanceName,
        project: projectId,
        location: DatabaseLocation.ANY,
        databaseUrl: utils.getDatabaseUrl(emulatorHost, instanceName, ""),
        type: DatabaseInstanceType.DEFAULT_DATABASE,
        state: DatabaseInstanceState.ACTIVE,
      });
    }
    throw new FirebaseError(
      `Failed to get instance details for instance: ${instanceName}. See firebase-debug.log for more details.`,
      {
        exit: 2,
        original: err,
      },
    );
  }
}

/**
 * Create a new database instance.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 * @param location location for the project's instance.
 * @param databaseType type of the database being created.
 */
export async function createInstance(
  projectId: string,
  instanceName: string,
  location: DatabaseLocation,
  databaseType: DatabaseInstanceType,
): Promise<DatabaseInstance> {
  try {
    const response = await apiClient.request({
      method: "POST",
      path: `/projects/${projectId}/locations/${location}/instances`,
      queryParams: { databaseId: instanceName },
      body: { type: databaseType },
      timeout: TIMEOUT_MILLIS,
    });

    return convertDatabaseInstance(response.body);
  } catch (err: any) {
    logger.debug(err.message);
    return utils.reject(
      `Failed to create instance: ${instanceName}. See firebase-debug.log for more details.`,
      {
        code: 2,
        original: err,
      },
    );
  }
}

/**
 * Checks if an instance with the specified name can be created.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 * @param databaseType type of the RTDB instance.
 * @param location location for the project's instance.
 * @return an object containing a boolean field "available", indicating if the specified name is available. If not available, the second optional array of strings "suggestedIds" is present and non-empty.
 */
export async function checkInstanceNameAvailable(
  projectId: string,
  instanceName: string,
  databaseType: DatabaseInstanceType,
  location?: DatabaseLocation,
): Promise<{ available: boolean; suggestedIds?: string[] }> {
  if (!location) {
    location = DatabaseLocation.US_CENTRAL1;
  }
  try {
    await apiClient.request({
      method: "POST",
      path: `/projects/${projectId}/locations/${location}/instances`,
      queryParams: { databaseId: instanceName, validateOnly: "true" },
      body: { type: databaseType },
      timeout: TIMEOUT_MILLIS,
    });
    return { available: true };
  } catch (err: any) {
    logger.debug(
      `Invalid Realtime Database instance name: ${instanceName}.${
        err.message ? " " + err.message : ""
      }`,
    );
    const errBody = err.context.body.error;
    if (errBody?.details?.[0]?.metadata?.suggested_database_ids) {
      return {
        available: false,
        suggestedIds: errBody.details[0].metadata.suggested_database_ids.split(","),
      };
    }
    throw new FirebaseError(
      `Failed to validate Realtime Database instance name: ${instanceName}.`,
      {
        original: err,
      },
    );
  }
}

/**
 * Parse the `DatabaseLocation` represented by the string
 * @param location the location to parse.
 * @param defaultLocation the default location value to use if unspecified.
 * @return specified default value if the string is undefined or empty, or parsed value.
 */
export function parseDatabaseLocation(
  location: string,
  defaultLocation: DatabaseLocation,
): DatabaseLocation {
  if (!location) {
    return defaultLocation;
  }
  switch (location.toLowerCase()) {
    case "us-central1":
      return DatabaseLocation.US_CENTRAL1;
    case "europe-west1":
      return DatabaseLocation.EUROPE_WEST1;
    case "asia-southeast1":
      return DatabaseLocation.ASIA_SOUTHEAST1;
    case "":
      return defaultLocation;
    default:
      throw new FirebaseError(
        `Unexpected location value: ${location}. Only us-central1, europe-west1, and asia-southeast1 locations are supported`,
      );
  }
}

/**
 * Lists all database instances for the specified project.
 * Repeatedly calls the paginated API until all pages have been read.
 * @param projectId the project to list apps for.
 * @param location optional location filter to restrict instances to specified location.
 * @param pageSize the number of results to be returned in a response.
 * @return list of all DatabaseInstances.
 */
export async function listDatabaseInstances(
  projectId: string,
  location: DatabaseLocation,
  pageSize: number = APP_LIST_PAGE_SIZE,
): Promise<DatabaseInstance[]> {
  const instances: DatabaseInstance[] = [];
  try {
    let nextPageToken: string | undefined = "";
    do {
      const queryParams: { pageSize: number; pageToken?: string } = { pageSize };
      if (nextPageToken) {
        queryParams.pageToken = nextPageToken;
      }
      const response = await apiClient.request<void, { instances: any[]; nextPageToken?: string }>({
        method: "GET",
        path: `/projects/${projectId}/locations/${location}/instances`,
        queryParams,
        timeout: TIMEOUT_MILLIS,
      });
      if (response.body.instances) {
        instances.push(...response.body.instances.map(convertDatabaseInstance));
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return instances;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to list Firebase Realtime Database instances${
        location === DatabaseLocation.ANY ? "" : ` for location ${location}`
      }` + ". See firebase-debug.log for more info.",
      {
        exit: 2,
        original: err,
      },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDatabaseInstance(serverInstance: any): DatabaseInstance {
  if (!serverInstance.name) {
    throw new FirebaseError(`DatabaseInstance response is missing field "name"`);
  }
  const m = serverInstance.name.match(INSTANCE_RESOURCE_NAME_REGEX);
  if (!m || m.length !== 4) {
    throw new FirebaseError(
      `Error parsing instance resource name: ${serverInstance.name}, matches: ${m}`,
    );
  }
  return {
    name: m[3],
    location: parseDatabaseLocation(m[2], DatabaseLocation.ANY),
    project: serverInstance.project,
    databaseUrl: serverInstance.databaseUrl,
    type: serverInstance.type,
    state: serverInstance.state,
  };
}
