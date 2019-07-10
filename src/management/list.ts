import * as api from "../api";
import { AppMetadata, AppPlatform, FirebaseProjectMetadata } from "./metadata";
import * as FirebaseError from "../error";
import * as logger from "../logger";

const TIMEOUT_MILLIS = 30000;
const PROJECT_LIST_PAGE_SIZE = 1000;
const APP_LIST_PAGE_SIZE = 100;

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

/**
 * Send recurring API requests to list all Firebase apps of a Firebase project
 * @return a promise that resolves to the list of all Firebase apps.
 */
export async function listFirebaseApps(
  projectId: string,
  platform: AppPlatform,
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<AppMetadata[]> {
  const apps: AppMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest(
        getListAppsResourceString(projectId, platform),
        pageSize,
        nextPageToken
      );
      if (response.body.apps) {
        const appsOnPage = response.body.apps.map(
          // app.platform does not exist if we use the endpoint for a specific platform
          (app: any) => (app.platform ? app : { ...app, platform })
        );
        apps.push(...appsOnPage);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to list Firebase ${platform === AppPlatform.ANY ? "" : platform + " "}` +
        "apps. See firebase-debug.log for more info.",
      {
        exit: 2,
        original: err,
      }
    );
  }
}

function getListAppsResourceString(projectId: string, platform: AppPlatform): string {
  let resourceSuffix;
  switch (platform) {
    case AppPlatform.IOS:
      resourceSuffix = "/iosApps";
      break;
    case AppPlatform.ANDROID:
      resourceSuffix = "/androidApps";
      break;
    case AppPlatform.WEB:
      resourceSuffix = "/webApps";
      break;
    case AppPlatform.ANY:
      resourceSuffix = ":searchApps"; // List apps in any platform
      break;
    default:
      throw new FirebaseError("Unexpected platform. Only support iOS, Android and Web apps");
  }

  return `/v1beta1/projects/${projectId}${resourceSuffix}`;
}

async function getPageApiRequest(
  resource: string,
  pageSize: number,
  nextPageToken?: string
): Promise<any> {
  const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
  return await api.request("GET", `${resource}?pageSize=${pageSize}${pageTokenQueryString}`, {
    auth: true,
    origin: api.firebaseApiOrigin,
    timeout: TIMEOUT_MILLIS,
  });
}
