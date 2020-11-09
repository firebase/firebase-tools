/**
 * Functions for interacting with Realtime Database Management APIs.
 * Internal documentation: https://source.corp.google.com/piper///depot/google3/google/firebase/database/v1beta/rtdb_service.proto
 */

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { Constants } from "../emulator/constants";
const MGMT_API_VERSION = "v1beta";
const TIMEOUT_MILLIS = 10000;
const APP_LIST_PAGE_SIZE = 100;
// projects/$PROJECT_ID/locations/$LOCATION_ID/instances/$INSTANCE_ID
const INSTANCE_RESOURCE_NAME_REGEX = /projects\/([^\/]+?)\/locations\/([^\/]+?)\/instances\/([^\/]*)/;

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

/**
 * Populate instanceDetails in commandOptions.
 * @param options command options that will be modified to add instanceDetails.
 */
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

    return convertDatabaseInstance(response.body);
  } catch (err) {
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

    return convertDatabaseInstance(response.body);
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
 * Parse the `DatabaseLocation` represented by the string
 * @param location the location to parse.
 * @param defaultLocation the default location value to use if unspecified.
 * @return specified default value if the string is undefined or empty, or parsed value.
 */
export function parseDatabaseLocation(
  location: string,
  defaultLocation: DatabaseLocation
): DatabaseLocation {
  if (!location) {
    return defaultLocation;
  }
  switch (location.toLowerCase()) {
    case "europe-west1":
      return DatabaseLocation.EUROPE_WEST1;
    case "asia-southeast1":
      return DatabaseLocation.ASIA_SOUTHEAST1;
    case "us-central1":
      return DatabaseLocation.US_CENTRAL1;
    case "":
      return defaultLocation;
    default:
      throw new FirebaseError(
        `Unexpected location value: ${location}. Only us-central1, europe-west1, and asia-southeast1 locations are supported`
      );
  }
}

/**
 * Lists all database instances for the specified project.
 * Repeatedly calls the paginated API until all pages have been read.
 * @param projectId the project to list apps for.
 * @param pageSize the number of results to be returned in a response.
 * @return list of all DatabaseInstances.
 */
export async function listDatabaseInstances(
  projectId: string,
  location: DatabaseLocation,
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<DatabaseInstance[]> {
  const instances: DatabaseInstance[] = [];
  try {
    let nextPageToken = "";
    do {
      const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      const response = await api.request(
        "GET",
        `/${MGMT_API_VERSION}/projects/${projectId}/locations/${location}/instances?pageSize=${pageSize}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: TIMEOUT_MILLIS,
        }
      );
      if (response.body.instances) {
        instances.push(...response.body.instances.map(convertDatabaseInstance));
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return instances;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to list Firebase Realtime Database instances${
        location === DatabaseLocation.ANY ? "" : ` for location ${location}`
      }` + ". See firebase-debug.log for more info.",
      {
        exit: 2,
        original: err,
      }
    );
  }
}

function convertDatabaseInstance(serverInstance: any): DatabaseInstance {
  if (!serverInstance.name) {
    throw new FirebaseError(`DatabaseInstance response is missing field "name"`);
  }
  const m = serverInstance.name.match(INSTANCE_RESOURCE_NAME_REGEX);
  if (!m || m.length != 4) {
    throw new FirebaseError(
      `Error parsing instance resource name: ${serverInstance.name}, matches: ${m}`
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
