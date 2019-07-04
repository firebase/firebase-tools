import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { pollOperation } from "./operation-poller";

const ONE_SECOND_MILLIS = 1000;

export enum AppPlatform {
  IOS = "IOS",
  ANDROID = "ANDROID",
  WEB = "WEB",
}

/**
 * Send an API request to create a new Firebase iOS app and poll the LRO to get the new app
 * information.
 * @return a promise that resolves to the new iOS app information
 */
export async function createIosApp(
  projectId: string,
  options: { displayName?: string; bundleId: string }
): Promise<any> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/iosApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
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
): Promise<any> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/androidApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
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
): Promise<any> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/webApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
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
