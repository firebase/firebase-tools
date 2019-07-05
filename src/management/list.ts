import * as api from "../api";
import {
  AndroidAppMetadata,
  AppMetadata,
  AppPlatform,
  FirebaseProjectMetadata,
  IosAppMetadata,
  WebAppMetadata,
} from "./metadata";
import * as FirebaseError from "../error";
import * as logger from "../logger";

const TIMEOUT_MILLIS = 30000;
const PROJECT_LIST_PAGE_SIZE = 1000;
const APP_LIST_PAGE_SIZE = 100;

/**
 * Send recurring API requests to list all Firebase projects belong to the current logged in account
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
      "Failed to list Firebase project. See firebase-debug.log for more info.",
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
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<AppMetadata[]> {
  const apps: AppMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest(
        `/v1beta1/projects/${projectId}:searchApps`,
        pageSize,
        nextPageToken
      );
      if (response.body.apps) {
        apps.push(...response.body.apps);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError("Failed to list Firebase apps. See firebase-debug.log for more info.", {
      exit: 2,
      original: err,
    });
  }
}

/**
 * Send recurring API requests to list all Firebase iOS apps of a Firebase project
 * @return a promise that resolves to the list of all iOS Firebase apps.
 */
export async function listIosApps(
  projectId: string,
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<IosAppMetadata[]> {
  const apps: IosAppMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest(
        `/v1beta1/projects/${projectId}/iosApps`,
        pageSize,
        nextPageToken
      );
      if (response.body.apps) {
        const appsOnPage = response.body.apps.map((a: any) => ({
          ...a,
          platform: AppPlatform.IOS,
        }));
        apps.push(...appsOnPage);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError("Failed to list iOS apps. See firebase-debug.log for more info.", {
      exit: 2,
      original: err,
    });
  }
}

/**
 * Send recurring API requests to list all Firebase Android apps of a Firebase project
 * @return a promise that resolves to the list of all Android Firebase apps.
 */
export async function listAndroidApps(
  projectId: string,
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<AndroidAppMetadata[]> {
  const apps: AndroidAppMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest(
        `/v1beta1/projects/${projectId}/androidApps`,
        pageSize,
        nextPageToken
      );
      if (response.body.apps) {
        const appsOnPage = response.body.apps.map((a: any) => ({
          ...a,
          platform: AppPlatform.ANDROID,
        }));
        apps.push(...appsOnPage);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError("Failed to list Android apps. See firebase-debug.log for more info.", {
      exit: 2,
      original: err,
    });
  }
}

/**
 * Send recurring API requests to list all Firebase Web apps of a Firebase project
 * @return a promise that resolves to the list of all Web Firebase apps.
 */
export async function listWebApps(
  projectId: string,
  pageSize: number = APP_LIST_PAGE_SIZE
): Promise<WebAppMetadata[]> {
  const apps: WebAppMetadata[] = [];
  try {
    let nextPageToken = "";
    do {
      const response = await getPageApiRequest(
        `/v1beta1/projects/${projectId}/webApps`,
        pageSize,
        nextPageToken
      );
      if (response.body.apps) {
        const appsOnPage = response.body.apps.map((a: any) => ({
          ...a,
          platform: AppPlatform.WEB,
        }));
        apps.push(...appsOnPage);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError("Failed to list Web apps. See firebase-debug.log for more info.", {
      exit: 2,
      original: err,
    });
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
