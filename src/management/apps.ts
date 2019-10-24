import * as fs from "fs";

import * as api from "../api";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import { pollOperation } from "../operation-poller";

const TIMEOUT_MILLIS = 30000;
const APP_LIST_PAGE_SIZE = 100;
const CREATE_APP_API_REQUEST_TIMEOUT_MILLIS = 15000;

const WEB_CONFIG_FILE_NAME = "google-config.js";

export interface AppMetadata {
  name: string /* The fully qualified resource name of the Firebase App */;
  projectId: string;
  appId: string;
  platform: AppPlatform;
  displayName?: string;
}

export interface IosAppMetadata extends AppMetadata {
  bundleId: string;
  appStoreId?: string;
  platform: AppPlatform.IOS;
}

export interface AndroidAppMetadata extends AppMetadata {
  packageName: string;
  platform: AppPlatform.ANDROID;
}

export interface WebAppMetadata extends AppMetadata {
  displayName: string;
  appUrls?: string[];
  platform: AppPlatform.WEB;
}

export interface AppConfigurationData {
  fileName: string;
  fileContents: string /* file contents in utf8 format */;
}

export enum AppPlatform {
  PLATFORM_UNSPECIFIED = "PLATFORM_UNSPECIFIED",
  IOS = "IOS",
  ANDROID = "ANDROID",
  WEB = "WEB",
  ANY = "ANY",
}

export function getAppPlatform(platform: string): AppPlatform {
  switch (platform.toUpperCase()) {
    case "IOS":
      return AppPlatform.IOS;
    case "ANDROID":
      return AppPlatform.ANDROID;
    case "WEB":
      return AppPlatform.WEB;
    case "": // list all apps if platform is not provided
      return AppPlatform.ANY;
    default:
      throw new FirebaseError("Unexpected platform. Only iOS, Android, and Web apps are supported");
  }
}

/**
 * Send an API request to create a new Firebase iOS app and poll the LRO to get the new app
 * information.
 * @return a promise that resolves to the new iOS app information
 */
export async function createIosApp(
  projectId: string,
  options: { displayName?: string; appStoreId?: string; bundleId: string }
): Promise<IosAppMetadata> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/iosApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      data: options,
    });
    const appData = await pollOperation<any>({
      pollerName: "Create iOS app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create iOS app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to create a new Firebase Android app and poll the LRO to get the new app
 * information.
 * @return a promise that resolves to the new Android app information
 */
export async function createAndroidApp(
  projectId: string,
  options: { displayName?: string; packageName: string }
): Promise<AndroidAppMetadata> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/androidApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      data: options,
    });
    const appData = await pollOperation<any>({
      pollerName: "Create Android app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create Android app for project ${projectId}. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      }
    );
  }
}

/**
 * Send an API request to create a new Firebase Web app and poll the LRO to get the new app
 * information.
 * @return a promise that resolves to the resource name of the create Web app LRO
 */
export async function createWebApp(
  projectId: string,
  options: { displayName?: string }
): Promise<WebAppMetadata> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/webApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      data: options,
    });
    const appData = await pollOperation<any>({
      pollerName: "Create Web app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create Web app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err }
    );
  }
}

/**
 * Lists all Firebase apps registered in a Firebase project, optionally filtered by a platform.
 * Repeatedly calls the paginated API until all pages have been read.
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
      const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      const response = await api.request(
        "GET",
        getListAppsResourceString(projectId, platform) +
          `?pageSize=${pageSize}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: TIMEOUT_MILLIS,
        }
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

/**
 * Gets the configuration artifact associated with the specified a Firebase app
 * @return a promise that resolves to configuration file content of the requested app
 */
export async function getAppConfig(
  appId: string,
  platform: AppPlatform
): Promise<AppConfigurationData> {
  let response;
  try {
    response = await api.request("GET", getAppConfigResourceString(appId, platform), {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: TIMEOUT_MILLIS,
    });
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get ${platform} app configuration. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      }
    );
  }
  return parseConfigFromResponse(response.body, platform);
}

function getAppConfigResourceString(appId: string, platform: AppPlatform): string {
  let platformResource;
  switch (platform) {
    case AppPlatform.IOS:
      platformResource = "iosApps";
      break;
    case AppPlatform.ANDROID:
      platformResource = "androidApps";
      break;
    case AppPlatform.WEB:
      platformResource = "webApps";
      break;
    default:
      throw new FirebaseError("Unexpected app platform");
  }

  return `/v1beta1/projects/-/${platformResource}/${appId}/config`;
}

function parseConfigFromResponse(responseBody: any, platform: AppPlatform): AppConfigurationData {
  if (platform === AppPlatform.WEB) {
    const JS_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/setup/web.js", "utf8");
    return {
      fileName: WEB_CONFIG_FILE_NAME,
      fileContents: JS_TEMPLATE.replace("{/*--CONFIG--*/}", JSON.stringify(responseBody, null, 2)),
    };
  } else if (platform === AppPlatform.ANDROID || platform === AppPlatform.IOS) {
    return {
      fileName: responseBody.configFilename,
      fileContents: Buffer.from(responseBody.configFileContents, "base64").toString("utf8"),
    };
  }
  throw new FirebaseError("Unexpected app platform");
}
