import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";

const ONE_SECOND_MILLIS = 1000;
const PAGE_SIZE = 1000;

export interface ProjectMetadata {
  name: string;
  projectId: string;
  projectNumber: string;
  displayName: string;
  resources: DefaultResources;
}

export interface DefaultResources {
  hostingSite: string;
  realtimeDatabaseInstance: string;
  storageBucket: string;
  locationId: string;
}

/**
 * Send recurring API requests to list all Firebase projects belong to the current logged in account
 * @return a promise that resolves to the new cloud project information
 */
export async function listFirebaseProjects(
  pageSize: number = PAGE_SIZE
): Promise<ProjectMetadata[]> {
  const projects: ProjectMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      const response = await api.request(
        "GET",
        `/v1beta1/projects?pageSize=${pageSize}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30 * ONE_SECOND_MILLIS,
        }
      );
      projects.push(...response.body.results);
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return projects;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list Firebase project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}
