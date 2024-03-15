import * as fs from "fs";

import { Client } from "../apiv2";
import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { pollOperation } from "../operation-poller";

const TIMEOUT_MILLIS = 30000;
export const APP_LIST_PAGE_SIZE = 100;
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
  // File contents in utf8 format.
  fileContents: string;
  // Only for `AppPlatform.WEB`, the raw configuration parameters.
  sdkConfig?: { [key: string]: string };
}

export interface AppAndroidShaData {
  name: string;
  shaHash: string;
  certType: ShaCertificateType.SHA_1;
}

export enum AppPlatform {
  PLATFORM_UNSPECIFIED = "PLATFORM_UNSPECIFIED",
  IOS = "IOS",
  ANDROID = "ANDROID",
  WEB = "WEB",
  ANY = "ANY",
}

export enum ShaCertificateType {
  SHA_CERTIFICATE_TYPE_UNSPECIFIED = "SHA_CERTIFICATE_TYPE_UNSPECIFIED",
  SHA_1 = "SHA_1",
  SHA_256 = "SHA_256",
}

/**
 * Returns the `AppPlatform` represented by the string.
 * @param platform the platform to parse.
 * @return the `AppPlatform`.
 */
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

const apiClient = new Client({ urlPrefix: firebaseApiOrigin, apiVersion: "v1beta1" });

/**
 * Send an API request to create a new Firebase iOS app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the new iOS app information
 */
export async function createIosApp(
  projectId: string,
  options: { displayName?: string; appStoreId?: string; bundleId: string },
): Promise<IosAppMetadata> {
  try {
    const response = await apiClient.request<
      { displayName?: string; appStoreId?: string; bundleId: string },
      { name: string }
    >({
      method: "POST",
      path: `/projects/${projectId}/iosApps`,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      body: options,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appData = await pollOperation<any>({
      pollerName: "Create iOS app Poller",
      apiOrigin: firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create iOS app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err },
    );
  }
}

/**
 * Send an API request to create a new Firebase Android app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the new Android app information.
 */
export async function createAndroidApp(
  projectId: string,
  options: { displayName?: string; packageName: string },
): Promise<AndroidAppMetadata> {
  try {
    const response = await apiClient.request<
      { displayName?: string; packageName: string },
      { name: string }
    >({
      method: "POST",
      path: `/projects/${projectId}/androidApps`,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      body: options,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appData = await pollOperation<any>({
      pollerName: "Create Android app Poller",
      apiOrigin: firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create Android app for project ${projectId}. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      },
    );
  }
}

/**
 * Send an API request to create a new Firebase Web app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the resource name of the create Web app LRO.
 */
export async function createWebApp(
  projectId: string,
  options: { displayName?: string },
): Promise<WebAppMetadata> {
  try {
    const response = await apiClient.request<{ displayName?: string }, { name: string }>({
      method: "POST",
      path: `/projects/${projectId}/webApps`,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
      body: options,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appData = await pollOperation<any>({
      pollerName: "Create Web app Poller",
      apiOrigin: firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return appData;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create Web app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err },
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

  return `/projects/${projectId}${resourceSuffix}`;
}

/**
 * Lists all Firebase apps registered in a Firebase project, optionally filtered by a platform.
 * Repeatedly calls the paginated API until all pages have been read.
 * @param projectId the project to list apps for.
 * @param platform the platform to list apps for.
 * @param pageSize the number of results to be returned in a response.
 * @return list of all Firebase apps.
 */
export async function listFirebaseApps(
  projectId: string,
  platform: AppPlatform,
  pageSize: number = APP_LIST_PAGE_SIZE,
): Promise<AppMetadata[]> {
  const apps: AppMetadata[] = [];
  try {
    let nextPageToken: string | undefined;
    do {
      const queryParams: { pageSize: number; pageToken?: string } = { pageSize };
      if (nextPageToken) {
        queryParams.pageToken = nextPageToken;
      }
      const response = await apiClient.request<void, { apps: any[]; nextPageToken?: string }>({
        method: "GET",
        path: getListAppsResourceString(projectId, platform),
        queryParams,
        timeout: TIMEOUT_MILLIS,
      });
      if (response.body.apps) {
        const appsOnPage = response.body.apps.map(
          // app.platform does not exist if we use the endpoint for a specific platform
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (app: any) => (app.platform ? app : { ...app, platform }),
        );
        apps.push(...appsOnPage);
      }
      nextPageToken = response.body.nextPageToken;
    } while (nextPageToken);

    return apps;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to list Firebase ${platform === AppPlatform.ANY ? "" : platform + " "}` +
        "apps. See firebase-debug.log for more info.",
      {
        exit: 2,
        original: err,
      },
    );
  }
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

  return `/projects/-/${platformResource}/${appId}/config`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Returns information representing the file need to initalize the application.
 * @param config the object from `getAppConfig`.
 * @param platform the platform the `config` represents.
 * @return the platform-specific file information (name and contents).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAppConfigFile(config: any, platform: AppPlatform): AppConfigurationData {
  return parseConfigFromResponse(config, platform);
}

/**
 * Gets the configuration artifact associated with the specified a Firebase app.
 * @param appId the ID of the app.
 * @param platform the platform of the app.
 * @return for web, an object with the variables set; for iOS and Android, a file name and
 *   base64-encoded content string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAppConfig(appId: string, platform: AppPlatform): Promise<any> {
  try {
    const response = await apiClient.request<void, any>({
      method: "GET",
      path: getAppConfigResourceString(appId, platform),
      timeout: TIMEOUT_MILLIS,
    });
    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get ${platform} app configuration. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      },
    );
  }
}

/**
 * Lists all Firebase android app SHA certificates identified by the specified app ID.
 * @param projectId the project to list SHA certificates for.
 * @param appId the ID of the app.
 * @return list of all Firebase android app SHA certificates.
 */
export async function listAppAndroidSha(
  projectId: string,
  appId: string,
): Promise<AppAndroidShaData[]> {
  const shaCertificates: AppAndroidShaData[] = [];
  try {
    const response = await apiClient.request<void, any>({
      method: "GET",
      path: `/projects/${projectId}/androidApps/${appId}/sha`,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
    });
    if (response.body.certificates) {
      shaCertificates.push(...response.body.certificates);
    }

    return shaCertificates;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to list SHA certificate hashes for Android app ${appId}.` +
        " See firebase-debug.log for more info.",
      {
        exit: 2,
        original: err,
      },
    );
  }
}

/**
 * Send an API request to add a new SHA hash for an Firebase Android app
 * @param projectId the project to add SHA certificate hash.
 * @param appId the app ID.
 * @param options options regarding the Android app certificate.
 * @return the created Android Certificate.
 */
export async function createAppAndroidSha(
  projectId: string,
  appId: string,
  options: { shaHash: string; certType: string },
): Promise<AppAndroidShaData> {
  try {
    const response = await apiClient.request<{ shaHash: string; certType: string }, any>({
      method: "POST",
      path: `/projects/${projectId}/androidApps/${appId}/sha`,
      body: options,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
    });
    const shaCertificate = response.body;
    return shaCertificate;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create SHA certificate hash for Android app ${appId}. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      },
    );
  }
}

/**
 * Send an API request to delete an existing Firebase Android app SHA certificate hash
 * @param projectId the project to delete SHA certificate hash.
 * @param appId the app ID to delete SHA certificate hash.
 * @param shaId the sha ID.
 */
export async function deleteAppAndroidSha(
  projectId: string,
  appId: string,
  shaId: string,
): Promise<void> {
  try {
    await apiClient.request<void, void>({
      method: "DELETE",
      path: `/projects/${projectId}/androidApps/${appId}/sha/${shaId}`,
      timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
    });
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to delete SHA certificate hash for Android app ${appId}. See firebase-debug.log for more info.`,
      {
        exit: 2,
        original: err,
      },
    );
  }
}
