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

export async function getDefaultDatabaseInstance(projectId: string): Promise<DatabaseInstance> {
  let it: DatabaseInstancesIterator = new DatabaseInstancesIterator(projectId);
  let moreIterations = true;
  do {
    let iterationResult = await it.next();
    moreIterations = !iterationResult.done;
    if (iterationResult.value) {
      const defaultInstances = iterationResult.value.filter(
        // filter returned instances array by type USER_DATABASE.
        (instance: any) => instance.type === DatabaseInstanceType.USER_DATABASE
      );
      if (defaultInstances.length > 1) {
        logger.debug(`Multiple RTDB instances found for project ${projectId}: ${defaultInstances}`);
        throw new FirebaseError(
          `More than one default RTDB instances exist for project ${projectId}`,
          {
            exit: 2,
          }
        );
      } else if (defaultInstances.length == 1) {
        return defaultInstances[0];
      }
    }
  } while (moreIterations);
  throw new FirebaseError(`No default RTDB instances exist for project ${projectId}`, {
    exit: 2,
  });
}

interface IterationResult {
  done: boolean;
  value: DatabaseInstance[];
}
class DatabaseInstancesIterator {
  constructor(projectId: string) {
    this.projectId = projectId;
  }
  private nextPageToken = "";
  private projectId = "smthing";
  // public next(): IteratorResult<number> {
  public async next(): Promise<IterationResult> {
    const pageTokenQueryString = this.nextPageToken ? `&pageToken=${this.nextPageToken}` : "";
    try {
      const response = await api.request(
        "GET",
        `/${MGMT_API_VERSION}/projects/${this.projectId}/locations/*/instances` +
          `?pageSize=${RTDB_INSTANCE_LIST_PAGE_SIZE}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: TIMEOUT_MILLIS,
        }
      );

      this.nextPageToken = response.body.nextPageToken;
      return { done: response.body.nextPageToken === "", value: response.body.instances };
    } catch (err) {
      logger.debug(err.message);
      return utils.reject(
        `Error while iterating over database instances for project: ${this.projectId}. See firebase-debug.log for more details.`,
        {
          code: 2,
        }
      );
    }
  }
}
