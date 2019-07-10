import * as api from "../api";
import { FirebaseProjectMetadata } from "./metadata";
import * as FirebaseError from "../error";
import * as logger from "../logger";

const TIMEOUT_MILLIS = 30000;
const PROJECT_LIST_PAGE_SIZE = 1000;

/**
 * Lists all Firebase projects associated with the currently logged-in account. Repeatedly calls the
 * paginated API until all pages have been read.
 * @return a promise that resolves to the list of all projects.
 */
export async function listFirebaseProjects(
  pageSize: number = PROJECT_LIST_PAGE_SIZE
): Promise<FirebaseProjectMetadata[]> {
  const projects: FirebaseProjectMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest("/v1beta1/projects", pageSize, nextPageToken);
      if (response.body.results) {
        projects.push(...response.body.results);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return projects;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list Firebase projects. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

async function getPageApiRequest(
  resource: string,
  pageSize: number = PROJECT_LIST_PAGE_SIZE,
  nextPageToken?: string
): Promise<any> {
  const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
  return await api.request("GET", `${resource}?pageSize=${pageSize}${pageTokenQueryString}`, {
    auth: true,
    origin: api.firebaseApiOrigin,
    timeout: TIMEOUT_MILLIS,
  });
}
