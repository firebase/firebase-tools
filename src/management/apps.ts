import * as fs from "fs-extra";
import * as ora from "ora";
import * as path from "path";
import { Client } from "../apiv2";
import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { pollOperation } from "../operation-poller";
import { WebConfig } from "../fetchWebSetup";
import { Platform } from "../dataconnect/types";
import { needProjectId } from "../projectUtils";
import { promptOnce, Question, prompt, promptForDirectory } from "../prompt";
import { getOrPromptProject } from "./projects";
import { Options } from "../options";
import { Config } from "../config";
import { getPlatformFromFolder } from "../dataconnect/fileUtils";
import { logBullet, logSuccess, logWarning } from "../utils";
import { AppsInitOptions } from "../commands/apps-init";

const TIMEOUT_MILLIS = 30000;
export const APP_LIST_PAGE_SIZE = 100;
const CREATE_APP_API_REQUEST_TIMEOUT_MILLIS = 15000;
const DISPLAY_NAME_QUESTION: Question = {
  type: "input",
  name: "displayName",
  default: "",
  message: "What would you like to call your app?",
};

interface CreateFirebaseAppOptions {
  project: string;
  nonInteractive: boolean;
  displayName?: string;
}

interface CreateIosAppOptions extends CreateFirebaseAppOptions {
  bundleId?: string;
  appStoreId?: string;
}

interface CreateAndroidAppOptions extends CreateFirebaseAppOptions {
  packageName: string;
}

interface CreateWebAppOptions extends CreateFirebaseAppOptions {
  displayName: string;
}

export async function getPlatform(appDir: string, config: Config) {
  // Detect what platform based on current user
  let targetPlatform = await getPlatformFromFolder(appDir);
  if (targetPlatform === Platform.NONE) {
    // If we aren't in an app directory, ask the user where their app is, and try to autodetect from there.
    appDir = await promptForDirectory({
      config,
      relativeTo: appDir, // CWD is passed in as `appDir`, so we want it relative to the current directory instead of where firebase.json is.
      message: "We couldn't determine what kind of app you're using. Where is your app directory?",
    });
    targetPlatform = await getPlatformFromFolder(appDir);
  }
  if (targetPlatform === Platform.NONE || targetPlatform === Platform.MULTIPLE) {
    if (targetPlatform === Platform.NONE) {
      logBullet(`Couldn't automatically detect app your in directory ${appDir}.`);
    } else {
      logSuccess(`Detected multiple app platforms in directory ${appDir}`);
      // Can only setup one platform at a time, just ask the user
    }
    const platforms = [
      { name: "iOS (Swift)", value: Platform.IOS },
      { name: "Web (JavaScript)", value: Platform.WEB },
      { name: "Android (Kotlin)", value: Platform.ANDROID },
    ];
    targetPlatform = await promptOnce({
      message:
        "Which platform do you want to set up an SDK for? Note: We currently do not support automatically setting up C++ or Unity projects.",
      type: "list",
      choices: platforms,
    });
  } else if (targetPlatform === Platform.FLUTTER) {
    logWarning(`Detected ${targetPlatform} app in directory ${appDir}`);
    throw new FirebaseError(`Flutter is not supported by apps:configure.
Please follow the link below to set up firebase for your Flutter app:
https://firebase.google.com/docs/flutter/setup
    `);
  } else {
    logSuccess(`Detected ${targetPlatform} app in directory ${appDir}`);
  }

  return targetPlatform === Platform.MULTIPLE
    ? AppPlatform.PLATFORM_UNSPECIFIED
    : (targetPlatform as unknown as AppPlatform);
}

async function initiateIosAppCreation(options: CreateIosAppOptions): Promise<IosAppMetadata> {
  if (!options.nonInteractive) {
    await prompt(options, [
      DISPLAY_NAME_QUESTION,
      {
        type: "input",
        default: "",
        name: "bundleId",
        message: "Please specify your iOS app bundle ID:",
      },
      {
        type: "input",
        default: "",
        name: "appStoreId",
        message: "Please specify your iOS app App Store ID:",
      },
    ]);
  }
  if (!options.bundleId) {
    throw new FirebaseError("Bundle ID for iOS app cannot be empty");
  }

  const spinner = ora("Creating your iOS app").start();
  try {
    const appData = await createIosApp(options.project, {
      displayName: options.displayName,
      bundleId: options.bundleId,
      appStoreId: options.appStoreId,
    });
    spinner.succeed();
    return appData;
  } catch (err: any) {
    spinner.fail();
    throw err;
  }
}

async function initiateAndroidAppCreation(
  options: CreateAndroidAppOptions,
): Promise<AndroidAppMetadata> {
  if (!options.nonInteractive) {
    await prompt(options, [
      DISPLAY_NAME_QUESTION,
      {
        type: "input",
        default: "",
        name: "packageName",
        message: "Please specify your Android app package name:",
      },
    ]);
  }
  if (!options.packageName) {
    throw new FirebaseError("Package name for Android app cannot be empty");
  }

  const spinner = ora("Creating your Android app").start();
  try {
    const appData = await createAndroidApp(options.project, {
      displayName: options.displayName,
      packageName: options.packageName,
    });
    spinner.succeed();
    return appData;
  } catch (err: any) {
    spinner.fail();
    throw err;
  }
}

async function initiateWebAppCreation(options: CreateWebAppOptions): Promise<WebAppMetadata> {
  if (!options.nonInteractive) {
    await prompt(options, [DISPLAY_NAME_QUESTION]);
  }
  if (!options.displayName) {
    throw new FirebaseError("Display name for Web app cannot be empty");
  }
  const spinner = ora("Creating your Web app").start();
  try {
    const appData = await createWebApp(options.project, { displayName: options.displayName });
    spinner.succeed();
    return appData;
  } catch (err: any) {
    spinner.fail();
    throw err;
  }
}
export type SdkInitOptions = CreateIosAppOptions | CreateAndroidAppOptions | CreateWebAppOptions;
export async function sdkInit(appPlatform: AppPlatform, options: SdkInitOptions) {
  let appData;
  switch (appPlatform) {
    case AppPlatform.IOS:
      appData = await initiateIosAppCreation(options);
      break;
    case AppPlatform.ANDROID:
      appData = await initiateAndroidAppCreation(options as CreateAndroidAppOptions);
      break;
    case AppPlatform.WEB:
      appData = await initiateWebAppCreation(options as CreateWebAppOptions);
      break;
    default:
      throw new FirebaseError("Unexpected error. This should not happen");
  }
  return appData;
}
export async function getSdkOutputPath(
  appDir: string,
  platform: AppPlatform,
  config: AppsInitOptions,
): Promise<string> {
  switch (platform) {
    case AppPlatform.ANDROID:
      const androidPath = await findIntelligentPathForAndroid(appDir, config);
      return path.join(androidPath, "google-services.json");
    case AppPlatform.WEB:
      return path.join(appDir, "firebase-js-config.json");
    case AppPlatform.IOS:
      const iosPath = await findIntelligentPathForIOS(appDir, config);
      return path.join(iosPath, "GoogleService-Info.plist");
  }
  throw new FirebaseError("Platform " + platform.toString() + " is not supported yet.");
}
export function checkForApps(apps: AppMetadata[], appPlatform: AppPlatform): void {
  if (!apps.length) {
    throw new FirebaseError(
      `There are no ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps ` +
        "associated with this Firebase project",
    );
  }
}
async function selectAppInteractively(
  apps: AppMetadata[],
  appPlatform: AppPlatform,
): Promise<AppMetadata> {
  checkForApps(apps, appPlatform);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choices = apps.map((app: any) => {
    return {
      name:
        `${app.displayName || app.bundleId || app.packageName}` +
        ` - ${app.appId} (${app.platform})`,
      value: app,
    };
  });

  return await promptOnce({
    type: "list",
    message:
      `Select the ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}` +
      "app to get the configuration data:",
    choices,
  });
}

export async function getSdkConfig(
  options: Options,
  appPlatform: AppPlatform,
  appId?: string,
): Promise<AppConfig> {
  if (!appId) {
    let projectId = needProjectId(options);
    if (options.nonInteractive && !projectId) {
      throw new FirebaseError("Must supply app and project ids in non-interactive mode.");
    } else if (!projectId) {
      const result = await getOrPromptProject(options);
      projectId = result.projectId;
    }

    const apps = await listFirebaseApps(projectId, appPlatform);
    // Fail out early if there's no apps.
    checkForApps(apps, appPlatform);
    // if there's only one app, we don't need to prompt interactively
    if (apps.length === 1) {
      // If there's only one, use it.
      appId = apps[0].appId;
      appPlatform = apps[0].platform;
    } else if (options.nonInteractive) {
      // If there's > 1 and we're non-interactive, fail.
      throw new FirebaseError(`Project ${projectId} has multiple apps, must specify an app id.`);
    } else {
      // > 1, ask what the user wants.
      const appMetadata: AppMetadata = await selectAppInteractively(apps, appPlatform);
      appId = appMetadata.appId;
      appPlatform = appMetadata.platform;
    }
  }

  let configData: AppConfig;
  const spinner = ora(
    `Downloading configuration data for your Firebase ${appPlatform} app`,
  ).start();
  try {
    configData = await getAppConfig(appId, appPlatform);
  } catch (err: any) {
    spinner.fail();
    throw err;
  }
  spinner.succeed();

  return configData;
}

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
  sdkConfig?: AppConfig;
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

const apiClient = new Client({ urlPrefix: firebaseApiOrigin(), apiVersion: "v1beta1" });

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
      apiOrigin: firebaseApiOrigin(),
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
      apiOrigin: firebaseApiOrigin(),
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
      apiOrigin: firebaseApiOrigin(),
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

function parseConfigFromResponse(
  responseBody: AppConfig,
  platform: AppPlatform,
): AppConfigurationData {
  if (platform === AppPlatform.WEB) {
    return {
      fileName: "firebase-js-config.json",
      fileContents: JSON.stringify(responseBody, null, 2),
    };
  } else if ("configFilename" in responseBody) {
    return {
      fileName: responseBody.configFilename,
      fileContents: Buffer.from(responseBody.configFileContents, "base64").toString("utf8"),
    };
  }
  throw new FirebaseError("Unexpected app platform");
}

export interface MobileConfig {
  configFilename: string;
  configFileContents: string;
}

/**
 * Returns information representing the file need to initalize the application.
 * @param config the object from `getAppConfig`.
 * @param platform the platform the `config` represents.
 * @return the platform-specific file information (name and contents).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAppConfigFile(config: AppConfig, platform: AppPlatform): AppConfigurationData {
  return parseConfigFromResponse(config, platform);
}

export type AppConfig = MobileConfig | WebConfig;

export async function writeConfigToFile(
  filename: string,
  nonInteractive: boolean,
  fileContents: string,
) {
  if (fs.existsSync(filename)) {
    if (nonInteractive) {
      throw new FirebaseError(`${filename} already exists`);
    }
    const overwrite = await promptOnce({
      type: "confirm",
      default: false,
      message: `${filename} already exists. Do you want to overwrite?`,
    });

    if (!overwrite) {
      return false;
    }
  }
  await fs.writeFile(filename, fileContents);
  return true;
}

/**
 * Gets the configuration artifact associated with the specified a Firebase app.
 * @param appId the ID of the app.
 * @param platform the platform of the app.
 * @return for web, an object with the variables set; for iOS and Android, a file name and
 *   base64-encoded content string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAppConfig(appId: string, platform: AppPlatform): Promise<AppConfig> {
  try {
    const response = await apiClient.request<void, AppConfig>({
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

export async function findIntelligentPathForIOS(appDir: string, options: AppsInitOptions) {
  const currentFiles: fs.Dirent[] = await fs.readdir(appDir, { withFileTypes: true });
  for (let i = 0; i < currentFiles.length; i++) {
    const dirent = currentFiles[i];
    const xcodeStr = ".xcodeproj";
    const file = dirent.name;
    if (file.endsWith(xcodeStr)) {
      return path.join(appDir, file.substring(0, file.length - xcodeStr.length));
    } else if (
      file === "Info.plist" ||
      file === "Assets.xcassets" ||
      (dirent.isDirectory() && file === "Preview Content")
    ) {
      return appDir;
    }
  }
  let outputPath: string | null = null;
  if (!options.nonInteractive) {
    outputPath = await promptForDirectory({
      config: options.config,
      message: `We weren't able to automatically determine the output directory. Where would you like to output your config file?`,
      relativeTo: appDir,
    });
  }
  if (!outputPath) {
    throw new Error("We weren't able to automatically determine the output directory.");
  }
  return outputPath;
}

export async function findIntelligentPathForAndroid(appDir: string, options: AppsInitOptions) {
  /**
   * android/build.gradle // if it's this, choose app
   * android/app/build.gradle // if it's this, choose current dir.
   */
  const paths = appDir.split("/");
  // For when app/build.gradle is found
  if (paths[0] === "app") {
    return appDir;
  } else {
    const currentFiles: fs.Dirent[] = await fs.readdir(appDir, { withFileTypes: true });
    const dirs: string[] = [];
    for (const fileOrDir of currentFiles) {
      if (fileOrDir.isDirectory()) {
        if (fileOrDir.name !== "gradle") {
          dirs.push(fileOrDir.name);
        }
        if (fileOrDir.name === "src") {
          return appDir;
        }
      }
    }
    let module = path.join(appDir, "app");
    // If app is the only module available, then put google-services.json in app/
    if (dirs.length === 1 && dirs[0] === "app") {
      return module;
    }
    if (!options.nonInteractive) {
      module = await promptForDirectory({
        config: options.config,
        message: `We weren't able to automatically determine the output directory. Where would you like to output your config file?`,
      });
    }
    return module;
  }
}
