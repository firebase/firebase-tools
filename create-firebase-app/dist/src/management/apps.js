"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findIntelligentPathForAndroid = exports.findIntelligentPathForIOS = exports.deleteAppAndroidSha = exports.createAppAndroidSha = exports.listAppAndroidSha = exports.getAppConfig = exports.writeConfigToFile = exports.getAppConfigFile = exports.listFirebaseApps = exports.createWebApp = exports.createAndroidApp = exports.createIosApp = exports.getAppPlatform = exports.ShaCertificateType = exports.AppPlatform = exports.getSdkConfig = exports.checkForApps = exports.getSdkOutputPath = exports.sdkInit = exports.getPlatform = exports.APP_LIST_PAGE_SIZE = void 0;
const fs = require("fs-extra");
const ora = require("ora");
const path = require("path");
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const error_1 = require("../error");
const logger_1 = require("../logger");
const operation_poller_1 = require("../operation-poller");
const types_1 = require("../dataconnect/types");
const projectUtils_1 = require("../projectUtils");
const prompt = require("../prompt");
const projects_1 = require("./projects");
const appFinder_1 = require("../dataconnect/appFinder");
const utils_1 = require("../utils");
const TIMEOUT_MILLIS = 30000;
exports.APP_LIST_PAGE_SIZE = 100;
const CREATE_APP_API_REQUEST_TIMEOUT_MILLIS = 15000;
async function getDisplayName() {
    return await prompt.input("What would you like to call your app?");
}
async function getPlatform(appDir, config) {
    // Detect what platform based on current user
    let targetPlatform = await (0, appFinder_1.getPlatformFromFolder)(appDir);
    if (targetPlatform === types_1.Platform.NONE) {
        // If we aren't in an app directory, ask the user where their app is, and try to autodetect from there.
        appDir = await (0, utils_1.promptForDirectory)({
            config,
            relativeTo: appDir,
            message: "We couldn't determine what kind of app you're using. Where is your app directory?",
        });
        targetPlatform = await (0, appFinder_1.getPlatformFromFolder)(appDir);
    }
    if (targetPlatform === types_1.Platform.NONE || targetPlatform === types_1.Platform.MULTIPLE) {
        if (targetPlatform === types_1.Platform.NONE) {
            (0, utils_1.logBullet)(`Couldn't automatically detect app your in directory ${appDir}.`);
        }
        else {
            (0, utils_1.logSuccess)(`Detected multiple app platforms in directory ${appDir}`);
            // Can only setup one platform at a time, just ask the user
        }
        const platforms = [
            { name: "iOS (Swift)", value: types_1.Platform.IOS },
            { name: "Web (JavaScript)", value: types_1.Platform.WEB },
            { name: "Android (Kotlin)", value: types_1.Platform.ANDROID },
        ];
        targetPlatform = await prompt.select({
            message: "Which platform do you want to set up an SDK for? Note: We currently do not support automatically setting up C++ or Unity projects.",
            choices: platforms,
        });
    }
    else if (targetPlatform === types_1.Platform.FLUTTER) {
        (0, utils_1.logWarning)(`Detected ${targetPlatform} app in directory ${appDir}`);
        throw new error_1.FirebaseError(`Flutter is not supported by apps:configure.
Please follow the link below to set up firebase for your Flutter app:
https://firebase.google.com/docs/flutter/setup
    `);
    }
    else {
        (0, utils_1.logSuccess)(`Detected ${targetPlatform} app in directory ${appDir}`);
    }
    return targetPlatform === types_1.Platform.MULTIPLE
        ? AppPlatform.PLATFORM_UNSPECIFIED
        : targetPlatform;
}
exports.getPlatform = getPlatform;
async function initiateIosAppCreation(options) {
    if (!options.nonInteractive) {
        options.displayName = options.displayName || (await getDisplayName());
        options.bundleId =
            options.bundleId || (await prompt.input("Please specify your iOS app bundle ID:"));
        options.appStoreId =
            options.appStoreId || (await prompt.input("Please specify your iOS app App Store ID:"));
    }
    if (!options.bundleId) {
        throw new error_1.FirebaseError("Bundle ID for iOS app cannot be empty");
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
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
}
async function initiateAndroidAppCreation(options) {
    if (!options.nonInteractive) {
        options.displayName = options.displayName || (await getDisplayName());
        options.packageName =
            options.packageName || (await prompt.input("Please specify your Android app package name:"));
    }
    if (!options.packageName) {
        throw new error_1.FirebaseError("Package name for Android app cannot be empty");
    }
    const spinner = ora("Creating your Android app").start();
    try {
        const appData = await createAndroidApp(options.project, {
            displayName: options.displayName,
            packageName: options.packageName,
        });
        spinner.succeed();
        return appData;
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
}
async function initiateWebAppCreation(options) {
    if (!options.nonInteractive) {
        options.displayName = options.displayName || (await getDisplayName());
    }
    if (!options.displayName) {
        throw new error_1.FirebaseError("Display name for Web app cannot be empty");
    }
    const spinner = ora("Creating your Web app").start();
    try {
        const appData = await createWebApp(options.project, { displayName: options.displayName });
        spinner.succeed();
        return appData;
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
}
async function sdkInit(appPlatform, options) {
    let appData;
    switch (appPlatform) {
        case AppPlatform.IOS:
            appData = await initiateIosAppCreation(options);
            break;
        case AppPlatform.ANDROID:
            appData = await initiateAndroidAppCreation(options);
            break;
        case AppPlatform.WEB:
            appData = await initiateWebAppCreation(options);
            break;
        default:
            throw new error_1.FirebaseError("Unexpected error. This should not happen");
    }
    return appData;
}
exports.sdkInit = sdkInit;
async function getSdkOutputPath(appDir, platform, config) {
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
    throw new error_1.FirebaseError("Platform " + platform.toString() + " is not supported yet.");
}
exports.getSdkOutputPath = getSdkOutputPath;
function checkForApps(apps, appPlatform) {
    if (!apps.length) {
        throw new error_1.FirebaseError(`There are no ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps ` +
            "associated with this Firebase project");
    }
}
exports.checkForApps = checkForApps;
async function selectAppInteractively(apps, appPlatform) {
    checkForApps(apps, appPlatform);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const choices = apps.map((app) => {
        return {
            name: `${app.displayName || app.bundleId || app.packageName}` +
                ` - ${app.appId} (${app.platform})`,
            value: app,
        };
    });
    return await prompt.select({
        message: `Select the ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}` +
            "app to get the configuration data:",
        choices,
    });
}
async function getSdkConfig(options, appPlatform, appId) {
    if (!appId) {
        let projectId = (0, projectUtils_1.needProjectId)(options);
        if (options.nonInteractive && !projectId) {
            throw new error_1.FirebaseError("Must supply app and project ids in non-interactive mode.");
        }
        else if (!projectId) {
            const result = await (0, projects_1.getOrPromptProject)(options);
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
        }
        else if (options.nonInteractive) {
            // If there's > 1 and we're non-interactive, fail.
            throw new error_1.FirebaseError(`Project ${projectId} has multiple apps, must specify an app id.`);
        }
        else {
            // > 1, ask what the user wants.
            const appMetadata = await selectAppInteractively(apps, appPlatform);
            appId = appMetadata.appId;
            appPlatform = appMetadata.platform;
        }
    }
    let configData;
    const spinner = ora(`Downloading configuration data for your Firebase ${appPlatform} app`).start();
    try {
        configData = await getAppConfig(appId, appPlatform);
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
    spinner.succeed();
    return configData;
}
exports.getSdkConfig = getSdkConfig;
var AppPlatform;
(function (AppPlatform) {
    AppPlatform["PLATFORM_UNSPECIFIED"] = "PLATFORM_UNSPECIFIED";
    AppPlatform["IOS"] = "IOS";
    AppPlatform["ANDROID"] = "ANDROID";
    AppPlatform["WEB"] = "WEB";
    AppPlatform["ANY"] = "ANY";
})(AppPlatform = exports.AppPlatform || (exports.AppPlatform = {}));
var ShaCertificateType;
(function (ShaCertificateType) {
    ShaCertificateType["SHA_CERTIFICATE_TYPE_UNSPECIFIED"] = "SHA_CERTIFICATE_TYPE_UNSPECIFIED";
    ShaCertificateType["SHA_1"] = "SHA_1";
    ShaCertificateType["SHA_256"] = "SHA_256";
})(ShaCertificateType = exports.ShaCertificateType || (exports.ShaCertificateType = {}));
/**
 * Returns the `AppPlatform` represented by the string.
 * @param platform the platform to parse.
 * @return the `AppPlatform`.
 */
function getAppPlatform(platform) {
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
            throw new error_1.FirebaseError("Unexpected platform. Only iOS, Android, and Web apps are supported");
    }
}
exports.getAppPlatform = getAppPlatform;
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.firebaseApiOrigin)(), apiVersion: "v1beta1" });
/**
 * Send an API request to create a new Firebase iOS app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the new iOS app information
 */
async function createIosApp(projectId, options) {
    try {
        const response = await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/iosApps`,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
            body: options,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appData = await (0, operation_poller_1.pollOperation)({
            pollerName: "Create iOS app Poller",
            apiOrigin: (0, api_1.firebaseApiOrigin)(),
            apiVersion: "v1beta1",
            operationResourceName: response.body.name /* LRO resource name */,
        });
        return appData;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to create iOS app for project ${projectId}. See firebase-debug.log for more info.`, { exit: 2, original: err });
    }
}
exports.createIosApp = createIosApp;
/**
 * Send an API request to create a new Firebase Android app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the new Android app information.
 */
async function createAndroidApp(projectId, options) {
    try {
        const response = await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/androidApps`,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
            body: options,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appData = await (0, operation_poller_1.pollOperation)({
            pollerName: "Create Android app Poller",
            apiOrigin: (0, api_1.firebaseApiOrigin)(),
            apiVersion: "v1beta1",
            operationResourceName: response.body.name /* LRO resource name */,
        });
        return appData;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to create Android app for project ${projectId}. See firebase-debug.log for more info.`, {
            exit: 2,
            original: err,
        });
    }
}
exports.createAndroidApp = createAndroidApp;
/**
 * Send an API request to create a new Firebase Web app and poll the LRO to get the new app
 * information.
 * @param projectId the project in which to create the app.
 * @param options options regarding the app.
 * @return the resource name of the create Web app LRO.
 */
async function createWebApp(projectId, options) {
    try {
        const response = await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/webApps`,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
            body: options,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appData = await (0, operation_poller_1.pollOperation)({
            pollerName: "Create Web app Poller",
            apiOrigin: (0, api_1.firebaseApiOrigin)(),
            apiVersion: "v1beta1",
            operationResourceName: response.body.name /* LRO resource name */,
        });
        return appData;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to create Web app for project ${projectId}. See firebase-debug.log for more info.`, { exit: 2, original: err });
    }
}
exports.createWebApp = createWebApp;
function getListAppsResourceString(projectId, platform) {
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
            throw new error_1.FirebaseError("Unexpected platform. Only support iOS, Android and Web apps");
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
async function listFirebaseApps(projectId, platform, pageSize = exports.APP_LIST_PAGE_SIZE) {
    const apps = [];
    try {
        let nextPageToken;
        do {
            const queryParams = { pageSize };
            if (nextPageToken) {
                queryParams.pageToken = nextPageToken;
            }
            const response = await apiClient.request({
                method: "GET",
                path: getListAppsResourceString(projectId, platform),
                queryParams,
                timeout: TIMEOUT_MILLIS,
            });
            if (response.body.apps) {
                const appsOnPage = response.body.apps.map(
                // app.platform does not exist if we use the endpoint for a specific platform
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (app) => (app.platform ? app : Object.assign(Object.assign({}, app), { platform })));
                apps.push(...appsOnPage);
            }
            nextPageToken = response.body.nextPageToken;
        } while (nextPageToken);
        return apps;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to list Firebase ${platform === AppPlatform.ANY ? "" : platform + " "}` +
            "apps. See firebase-debug.log for more info.", {
            exit: 2,
            original: err,
        });
    }
}
exports.listFirebaseApps = listFirebaseApps;
function getAppConfigResourceString(appId, platform) {
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
            throw new error_1.FirebaseError("Unexpected app platform");
    }
    return `/projects/-/${platformResource}/${appId}/config`;
}
function parseConfigFromResponse(responseBody, platform) {
    if (platform === AppPlatform.WEB) {
        return {
            fileName: "firebase-js-config.json",
            fileContents: JSON.stringify(responseBody, null, 2),
        };
    }
    else if ("configFilename" in responseBody) {
        return {
            fileName: responseBody.configFilename,
            fileContents: Buffer.from(responseBody.configFileContents, "base64").toString("utf8"),
        };
    }
    throw new error_1.FirebaseError("Unexpected app platform");
}
/**
 * Returns information representing the file need to initalize the application.
 * @param config the object from `getAppConfig`.
 * @param platform the platform the `config` represents.
 * @return the platform-specific file information (name and contents).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAppConfigFile(config, platform) {
    return parseConfigFromResponse(config, platform);
}
exports.getAppConfigFile = getAppConfigFile;
async function writeConfigToFile(filename, nonInteractive, fileContents) {
    if (fs.existsSync(filename)) {
        if (nonInteractive) {
            throw new error_1.FirebaseError(`${filename} already exists`);
        }
        const overwrite = await prompt.confirm(`${filename} already exists. Do you want to overwrite?`);
        if (!overwrite) {
            return false;
        }
    }
    await fs.writeFile(filename, fileContents);
    return true;
}
exports.writeConfigToFile = writeConfigToFile;
/**
 * Gets the configuration artifact associated with the specified a Firebase app.
 * @param appId the ID of the app.
 * @param platform the platform of the app.
 * @return for web, an object with the variables set; for iOS and Android, a file name and
 *   base64-encoded content string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAppConfig(appId, platform) {
    try {
        const response = await apiClient.request({
            method: "GET",
            path: getAppConfigResourceString(appId, platform),
            timeout: TIMEOUT_MILLIS,
        });
        return response.body;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to get ${platform} app configuration. See firebase-debug.log for more info.`, {
            exit: 2,
            original: err,
        });
    }
}
exports.getAppConfig = getAppConfig;
/**
 * Lists all Firebase android app SHA certificates identified by the specified app ID.
 * @param projectId the project to list SHA certificates for.
 * @param appId the ID of the app.
 * @return list of all Firebase android app SHA certificates.
 */
async function listAppAndroidSha(projectId, appId) {
    const shaCertificates = [];
    try {
        const response = await apiClient.request({
            method: "GET",
            path: `/projects/${projectId}/androidApps/${appId}/sha`,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
        });
        if (response.body.certificates) {
            shaCertificates.push(...response.body.certificates);
        }
        return shaCertificates;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to list SHA certificate hashes for Android app ${appId}.` +
            " See firebase-debug.log for more info.", {
            exit: 2,
            original: err,
        });
    }
}
exports.listAppAndroidSha = listAppAndroidSha;
/**
 * Send an API request to add a new SHA hash for an Firebase Android app
 * @param projectId the project to add SHA certificate hash.
 * @param appId the app ID.
 * @param options options regarding the Android app certificate.
 * @return the created Android Certificate.
 */
async function createAppAndroidSha(projectId, appId, options) {
    try {
        const response = await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/androidApps/${appId}/sha`,
            body: options,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
        });
        const shaCertificate = response.body;
        return shaCertificate;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to create SHA certificate hash for Android app ${appId}. See firebase-debug.log for more info.`, {
            exit: 2,
            original: err,
        });
    }
}
exports.createAppAndroidSha = createAppAndroidSha;
/**
 * Send an API request to delete an existing Firebase Android app SHA certificate hash
 * @param projectId the project to delete SHA certificate hash.
 * @param appId the app ID to delete SHA certificate hash.
 * @param shaId the sha ID.
 */
async function deleteAppAndroidSha(projectId, appId, shaId) {
    try {
        await apiClient.request({
            method: "DELETE",
            path: `/projects/${projectId}/androidApps/${appId}/sha/${shaId}`,
            timeout: CREATE_APP_API_REQUEST_TIMEOUT_MILLIS,
        });
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to delete SHA certificate hash for Android app ${appId}. See firebase-debug.log for more info.`, {
            exit: 2,
            original: err,
        });
    }
}
exports.deleteAppAndroidSha = deleteAppAndroidSha;
async function findIntelligentPathForIOS(appDir, options) {
    const currentFiles = await fs.readdir(appDir, { withFileTypes: true });
    for (let i = 0; i < currentFiles.length; i++) {
        const dirent = currentFiles[i];
        const xcodeStr = ".xcodeproj";
        const file = dirent.name;
        if (file.endsWith(xcodeStr)) {
            return path.join(appDir, file.substring(0, file.length - xcodeStr.length));
        }
        else if (file === "Info.plist" ||
            file === "Assets.xcassets" ||
            (dirent.isDirectory() && file === "Preview Content")) {
            return appDir;
        }
    }
    let outputPath = null;
    if (!options.nonInteractive) {
        outputPath = await (0, utils_1.promptForDirectory)({
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
exports.findIntelligentPathForIOS = findIntelligentPathForIOS;
async function findIntelligentPathForAndroid(appDir, options) {
    /**
     * android/build.gradle // if it's this, choose app
     * android/app/build.gradle // if it's this, choose current dir.
     */
    const paths = appDir.split("/");
    // For when app/build.gradle is found
    if (paths[0] === "app") {
        return appDir;
    }
    else {
        const currentFiles = await fs.readdir(appDir, { withFileTypes: true });
        const dirs = [];
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
            module = await (0, utils_1.promptForDirectory)({
                config: options.config,
                message: `We weren't able to automatically determine the output directory. Where would you like to output your config file?`,
            });
        }
        return module;
    }
}
exports.findIntelligentPathForAndroid = findIntelligentPathForAndroid;
