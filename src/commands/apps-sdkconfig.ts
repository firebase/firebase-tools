import * as ora from "ora";
import * as fs from "fs-extra";

import { Command } from "../command";
import {
  AppConfigurationData,
  AppMetadata,
  AppPlatform,
  getAppConfig,
  getAppConfigFile,
  getAppPlatform,
  listFirebaseApps,
} from "../management/apps";
import { needProjectId } from "../projectUtils";
import { getOrPromptProject } from "../management/projects";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promptForDirectory, promptOnce } from "../prompt";
import { Options } from "../options";
import { getPlatformFromFolder } from "../dataconnect/fileUtils";
import * as path from "path";
import { Platform } from "../dataconnect/types";
import { logBullet, logSuccess } from "../utils";
import { sdkInit } from "./apps-create";
export function getSdkOutputPath(appDir: string, platform: Platform): string {
  switch (platform) {
    case Platform.ANDROID:
      // build.gradle can be in either / or /android/app. We always want to place the google-services.json in /android/app.
      // So we check the current directory if it's app, and if so, we'll place it in the current directory, if not, we'll put it in the android/app dir.
      // Fallback is just to the current app dir.
      if (path.dirname(appDir) !== "app") {
        try {
          const fileNames = fs.readdirSync(path.join(appDir, "app"));
          if (fileNames.includes("build.gradle")) {
            appDir = path.join(appDir, "app");
          }
        } catch {
          // Wasn't able to find app dir. Default to outputting to current directory.
        }
      }
      return path.join(appDir, "google-services.json");
    case Platform.WEB:
      return path.join(appDir, "firebase-js-config.json");
    case Platform.IOS:
      return path.join(appDir, "GoogleService-Info.plist");
  }
  throw new Error("Platform " + platform.toString() + " is not supported yet.");
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
): Promise<any> {
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

  let configData;
  const spinner = ora(`Downloading configuration data of your Firebase ${appPlatform} app`).start();
  try {
    configData = await getAppConfig(appId, appPlatform);
  } catch (err: any) {
    spinner.fail();
    throw err;
  }
  spinner.succeed();

  return configData;
}

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
      return;
    }
  }
  // TODO(mtewani): Make the call to get the fileContents a part of one of these util fns.
  fs.writeFileSync(filename, fileContents);
}

export const command = new Command("apps:sdkconfig [platform] [appId]")
  .description(
    "print the Google Services config of a Firebase app. " +
      "[platform] can be IOS, ANDROID or WEB (case insensitive)",
  )
  .option("-o, --out [file]", "(optional) write config output to a file")
  .before(requireAuth)
  .action(async (platform = "", appId = "", options: Options): Promise<AppConfigurationData> => {
    /**
     * 1. If the user has already selected where they want to output to, then skip the autodetection
     * 2. If the user hasn't already selected where they want to output to, determine what platform they want.
     */
    let outputPath: string | undefined = undefined;
    if (options.out === undefined) {
      // do auto-download
      let appDir = process.cwd();
      const config = options.config;
      if (!platform) {
        // Detect what platform based on current user
        let targetPlatform = await getPlatformFromFolder(appDir);
        if (targetPlatform === Platform.NONE) {
          // If we aren't in an app directory, ask the user where their app is, and try to autodetect from there.
          appDir = await promptForDirectory({
            config,
            message: "Where is your app directory?",
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
            { name: "Flutter (Dart)", value: Platform.FLUTTER },
          ];
          targetPlatform = await promptOnce({
            message: "Which platform do you want to set up a generated SDK for?",
            type: "list",
            choices: platforms,
          });
        } else {
          logSuccess(`Detected ${targetPlatform} app in directory ${appDir}`);
        }
        platform = targetPlatform as Platform;
        outputPath = getSdkOutputPath(appDir, platform);
      }
    }
    const outputDir = path.dirname(outputPath!);
    fs.mkdirpSync(outputDir);
    // TODO(mtewani): Map any -> unknown

    // TODO(mtewani): Include message for Dart
    // TODO(mtewani): Include prompt for optional appId
    let sdkConfig: any;
    while (sdkConfig === undefined) {
      try {
        sdkConfig = await getSdkConfig(options, getAppPlatform(platform), appId);
      } catch (e) {
        if ((e as Error).message.includes("associated with this Firebase project")) {
          await sdkInit(platform as unknown as AppPlatform, options);
        } else {
          throw e;
        }
      }
    }

    const fileInfo = getAppConfigFile(sdkConfig, platform as unknown as AppPlatform);
    await writeConfigToFile(outputPath!, options.nonInteractive, fileInfo.fileContents);

    if (platform === AppPlatform.WEB) {
      console.log(`
      How to use your JS SDK Config:
      ES Module:
      import { initializeApp } from 'firebase/app';
      import json from './firebase-js-config.json';
      initializeApp(json);
      // CommonJS Module:
      const { initializeApp } from 'firebase/app';
      const json = require('./firebase-js-config.json');
      initializeApp(json);// instead of initializeApp(config);
        `);
      if (platform === AppPlatform.WEB) {
        fileInfo.sdkConfig = sdkConfig;
      }
    }

    if (options.out === undefined) {
      logger.info(fileInfo.fileContents);
      return fileInfo;
    }

    const shouldUseDefaultFilename = options.out === true || options.out === "";

    const filename = shouldUseDefaultFilename ? sdkConfig.fileName : options.out;
    await writeConfigToFile(filename, options.nonInteractive, fileInfo.fileContents);
    logger.info(`App configuration is written in ${filename}`);
    return sdkConfig;
  });
