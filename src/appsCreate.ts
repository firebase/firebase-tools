import * as clc from "cli-color";

import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { pollOperation } from "./operation-poller";
import { OraWrapper } from "./oraWrapper";

const ONE_SECOND_MILLIS = 1000;

export enum AppPlatform {
  IOS = "iOS",
  ANDROID = "Android",
  WEB = "Web",
}

export interface AppMetadata {
  appId: string;
  displayName: string;
  appPlatform: AppPlatform;
}

export interface IosAppMetadata extends AppMetadata {
  bundleId: string;
  appPlatform: AppPlatform.IOS;
}

export interface AndroidAppMetadata extends AppMetadata {
  packageName: string;
  shaCertificates?: ShaCertificate[];
  appPlatform: AppPlatform.ANDROID;
}

export interface WebAppMetadata extends AppMetadata {
  appPlatform: AppPlatform.WEB;
}

export interface ShaCertificate {
  name?: string;
  certType: "SHA_1" | "SHA_256";
  shaHash: string;
}

/**
 * Send an API request to create a new Firebase iOS app and poll the LRO to get the new app
 * information.
 * @return {Promise} this function returns a promise that resolves to the new iOS app information
 */
export async function createIosApp(
  projectId: string,
  displayName: string,
  bundleId: string
): Promise<IosAppMetadata> {
  const spinner = new OraWrapper("Creating your iOS app");
  spinner.start();

  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/iosApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { displayName, bundleId },
    });
    const result = await pollOperation<any>({
      pollerName: "Create iOS app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    const appMetadata: IosAppMetadata = {
      appId: result.appId,
      displayName: result.displayName,
      bundleId: result.bundleId,
      appPlatform: AppPlatform.IOS,
    };
    logPostAppCreationInformation(appMetadata);
    return appMetadata;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create iOS app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to create a new Firebase Android app and poll the LRO to get the new app
 * information. Optionally add a SHA certificate to the app if specified.
 * @return {Promise} this function returns a promise that resolves to the new Android app
 *     information
 */
export async function createAndroidApp(
  projectId: string,
  displayName: string,
  packageName: string,
  shaCertificate?: ShaCertificate
): Promise<AndroidAppMetadata> {
  let spinner = new OraWrapper("Creating your Android app");
  let isAppCreated = false;
  spinner.start();

  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/androidApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { displayName, packageName },
    });
    const result = await pollOperation<any>({
      pollerName: "Create Android app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    isAppCreated = true;
    const appMetadata: AndroidAppMetadata = {
      appId: result.appId,
      displayName: result.displayName,
      packageName: result.packageName,
      appPlatform: AppPlatform.ANDROID,
    };
    logPostAppCreationInformation(appMetadata);

    if (shaCertificate) {
      spinner = new OraWrapper(`Adding sha certificate to your app`);
      spinner.start();
      const shaResponse = await api.request(
        "POST",
        `/v1beta1/projects/-/androidApps/${appMetadata.appId}/sha`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15 * ONE_SECOND_MILLIS,
          data: shaCertificate,
        }
      );
      spinner.succeed();
      appMetadata.shaCertificates = [shaResponse.body];
    }

    return appMetadata;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    const message = !isAppCreated
      ? `Failed to create Android app for project ${projectId}`
      : "Failed to add sha certificate for your Android app";
    throw new FirebaseError(`${message}. See firebase-debug.log for more info.`, {
      exit: 2,
      original: err,
    });
  }
}

/**
 * Send an API request to create a new Firebase Web app and poll the LRO to get the new app
 * information.
 * @return {Promise} this function returns a promise that resolves to the resource name of the
 *     create Web app LRO, or rejects if an error is thrown
 */
export async function createWebApp(
  projectId: string,
  displayName: string
): Promise<WebAppMetadata> {
  const spinner = new OraWrapper("Creating your Web app");
  spinner.start();

  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}/webApps`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { displayName },
    });
    const result = await pollOperation<any>({
      pollerName: "Create Web app Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    const appMetadata: WebAppMetadata = {
      appId: result.appId,
      displayName: result.displayName,
      appPlatform: AppPlatform.WEB,
    };
    logPostAppCreationInformation(appMetadata);
    return appMetadata;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to create Web app for project ${projectId}. See firebase-debug.log for more info.`,
      { exit: 2, original: err }
    );
  }
}

function logPostAppCreationInformation(appMetadata: AppMetadata): void {
  logger.log(`🎉🎉🎉 Your Firebase ${appMetadata.appPlatform} App is ready! 🎉🎉🎉`);
  logger.log("");
  logger.log("App information:");
  logger.log(`  - App ID: ${appMetadata.appId}`);
  logger.log(`  - Display name: ${appMetadata.displayName}`);
  if (appMetadata.appPlatform === AppPlatform.IOS) {
    logger.log(`  - Bundle ID: ${(appMetadata as IosAppMetadata).bundleId}`);
  } else if (appMetadata.appPlatform === AppPlatform.ANDROID) {
    const androidAppMetadata = appMetadata as AndroidAppMetadata;
    logger.log(`  - Package name: ${androidAppMetadata.packageName}`);
  }
}
