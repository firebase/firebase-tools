import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { pollOperation } from "./operation-poller";

const ONE_SECOND_MILLIS = 1000;

export enum ParentResourceType {
  ORGANIZATION = "organization",
  FOLDER = "folder",
}

export interface ParentResource {
  id: string;
  type: ParentResourceType;
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return a promise that resolves to the new cloud project information
 */
export async function createCloudProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ParentResource }
): Promise<any> {
  try {
    const response = await api.request("POST", "/v1/projects", {
      auth: true,
      origin: api.resourceManagerOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { projectId, name: options.displayName || projectId, parent: options.parentResource },
    });

    const projectInfo = await pollOperation<any>({
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to create Google Cloud project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return a promise that resolves to the new firebase project information
 */
export async function addFirebaseToCloudProject(projectId: string): Promise<any> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}:addFirebase`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}
