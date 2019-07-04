import * as api from "../api";
import { FirebaseProjectMetadata } from "./metadata";
import * as FirebaseError from "../error";
import * as logger from "../logger";

const TIMEOUT_MILLIS = 30000;
const PAGE_SIZE = 1000;

/**
 * Send recurring API requests to list all Firebase projects belong to the current logged in account
 * @return a promise that resolves to the new cloud project information
 */
export async function listFirebaseProjects(
  pageSize: number = PAGE_SIZE
): Promise<FirebaseProjectMetadata[]> {
  const projects: FirebaseProjectMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest("/v1beta1/projects", pageSize, nextPageToken);
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

async function getPageApiRequest(
  resource: string,
  pageSize: number = PAGE_SIZE,
  nextPageToken?: string
): Promise<any> {
  const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
  return await api.request("GET", `${resource}?pageSize=${pageSize}${pageTokenQueryString}`, {
    auth: true,
    origin: api.firebaseApiOrigin,
    timeout: TIMEOUT_MILLIS,
  });
}
