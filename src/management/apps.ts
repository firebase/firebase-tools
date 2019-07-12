import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import { pollOperation } from "../operation-poller";

const CREATE_APP_API_REQUEST_TIMEOUT_MILLIS = 15000;

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
      return AppPlatform.PLATFORM_UNSPECIFIED;
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
