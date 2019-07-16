import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import { pollOperation } from "../operation-poller";

const TIMEOUT_MILLIS = 30000;
const PROJECT_LIST_PAGE_SIZE = 1000;
const CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS = 15000;

export interface FirebaseProjectPage {
  projects: FirebaseProjectMetadata[];
  nextPageToken?: string;
}
export interface FirebaseProjectMetadata {
  name: string /* The fully qualified resource name of the Firebase project */;
  projectId: string;
  projectNumber: string;
  displayName: string;
  resources?: DefaultProjectResources;
}

export interface DefaultProjectResources {
  hostingSite?: string;
  realtimeDatabaseInstance?: string;
  storageBucket?: string;
  locationId?: string;
}

export enum ProjectParentResourceType {
  ORGANIZATION = "organization",
  FOLDER = "folder",
}

export interface ProjectParentResource {
  id: string;
  type: ProjectParentResourceType;
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return a promise that resolves to the new cloud project information
 */
export async function createCloudProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ProjectParentResource }
): Promise<any> {
  try {
    const response = await api.request("POST", "/v1/projects", {
      auth: true,
      origin: api.resourceManagerOrigin,
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
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
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
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

/**
 * Lists Firebase projects in a page using the paginated API, identified by the page token and its
 * size.
 */
export async function getProjectPage(
  pageSize: number = PROJECT_LIST_PAGE_SIZE,
  pageToken?: string
): Promise<FirebaseProjectPage> {
  let apiResponse;

  try {
    const pageTokenQueryString = pageToken ? `&pageToken=${pageToken}` : "";
    apiResponse = await api.request(
      "GET",
      `/v1beta1/projects?pageSize=${pageSize}${pageTokenQueryString}`,
      {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: TIMEOUT_MILLIS,
      }
    );
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list Firebase projects. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }

  const projectPage: FirebaseProjectPage = { projects: [] };
  if (apiResponse.body.results) {
    projectPage.projects.push(...apiResponse.body.results);
  }
  if (apiResponse.body.nextPageToken) {
    projectPage.nextPageToken = apiResponse.body.nextPageToken;
  }
  return projectPage;
}

/**
 * Lists all Firebase projects associated with the currently logged-in account. Repeatedly calls the
 * paginated API until all pages have been read.
 * @return a promise that resolves to the list of all projects.
 */
export async function listFirebaseProjects(pageSize?: number): Promise<FirebaseProjectMetadata[]> {
  const projects: FirebaseProjectMetadata[] = [];
  let nextPageToken;

  do {
    const projectPage: FirebaseProjectPage = await getProjectPage(pageSize, nextPageToken);
    projects.push(...projectPage.projects);
    nextPageToken = projectPage.nextPageToken;
  } while (nextPageToken);

  return projects;
}

/**
 * Gets the Firebase project information identified by the specified project ID
 */
export async function getFirebaseProject(projectId: string): Promise<FirebaseProjectMetadata> {
  try {
    const response = await api.request("GET", `/v1beta1/projects/${projectId}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: TIMEOUT_MILLIS,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Firebase project ${projectId}` +
        ". Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}
