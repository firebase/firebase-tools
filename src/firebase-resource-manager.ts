import * as clc from "cli-color";

import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { pollOperation } from "./operation-poller";
import { OraWrapper } from "./oraWrapper";

const ONE_SECOND_MILLIS = 1000;

export enum ParentResourceType {
  ORGANIZATION = "organization",
  FOLDER = "folder",
}

export interface ParentResource {
  id: string;
  type: ParentResourceType;
}

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
  certType: "SHA_1" | "SHA_256";
  shaHash: string;
}

export async function createFirebaseProject(
  projectId: string,
  projectDisplayName: string,
  parentResource?: ParentResource
): Promise<{ projectId: string }> {
  await createCloudProject(projectId, projectDisplayName, parentResource);
  const projectInfo = await addFirebaseToCloudProject(projectId);

  logger.info("");
  logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
  logger.info("");
  logger.info("Project information:");
  logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
  logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
  logger.info("");
  logger.info("Firebase console is available at");
  logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
  return { projectId };
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return {Promise} this function returns a promise that resolves to the new cloud project
 *     information
 */
async function createCloudProject(
  projectId: string,
  projectDisplayName: string,
  parentResource?: ParentResource
): Promise<any> {
  const spinner = new OraWrapper("Creating Google Cloud Platform project");
  spinner.start();

  try {
    const response = await api.request("POST", "/v1/projects", {
      auth: true,
      origin: api.resourceManagerOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { projectId, name: projectDisplayName, parent: parentResource },
    });

    const projectInfo = await pollOperation<any>({
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    return projectInfo;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to create Google Cloud project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return {Promise} this function returns a promise that resolves to the new firebase project
 *    information
 */
async function addFirebaseToCloudProject(projectId: string): Promise<any> {
  const spinner = new OraWrapper("Adding Firebase to Google Cloud project");
  spinner.start();

  // TODO(caot): Removed when "Deferred Analytics" and "Deferred Location" are launched
  const timeZone = "America/Los_Angeles";
  const regionCode = "US";
  const locationId = "us-central";

  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}:addFirebase`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { timeZone, regionCode, locationId },
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    return projectInfo;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
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
  const spinner = new OraWrapper(`Creating your ${clc.red("iOS")} app`);
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
 * information
 */
export async function createAndroidApp(
  projectId: string,
  displayName: string,
  packageName: string,
  shaCertificate?: ShaCertificate
): Promise<AndroidAppMetadata> {
  let spinner = new OraWrapper(`Creating your ${clc.red("Android")} app`);
  let isProjectCreated = false;
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
    isProjectCreated = true;
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
      await api.request("POST", `/v1beta1/projects/-/androidApps/${appMetadata.appId}/sha`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15 * ONE_SECOND_MILLIS,
        data: shaCertificate,
      });
      spinner.succeed();
      appMetadata.shaCertificates = [shaCertificate];
    }
    return appMetadata;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    const message = !isProjectCreated
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
 *      create Web app LRO, or rejects if an error is thrown
 */
export async function createWebApp(
  projectId: string,
  displayName: string
): Promise<WebAppMetadata> {
  const spinner = new OraWrapper(`Creating your ${clc.red("Web")} app`);
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
