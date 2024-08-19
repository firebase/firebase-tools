import * as clc from "colorette";
import * as ora from "ora";

import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import {
  AndroidAppMetadata,
  AppMetadata,
  AppPlatform,
  createAndroidApp,
  createIosApp,
  createWebApp,
  getAppPlatform,
  IosAppMetadata,
  WebAppMetadata,
} from "../management/apps";
import { prompt, promptOnce, Question } from "../prompt";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";

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

function logPostAppCreationInformation(
  appMetadata: IosAppMetadata | AndroidAppMetadata | WebAppMetadata,
  appPlatform: AppPlatform,
): void {
  logger.info("");
  logger.info(`🎉🎉🎉 Your Firebase ${appPlatform} App is ready! 🎉🎉🎉`);
  logger.info("");
  logger.info("App information:");
  logger.info(`  - App ID: ${appMetadata.appId}`);
  if (appMetadata.displayName) {
    logger.info(`  - Display name: ${appMetadata.displayName}`);
  }
  if (appPlatform === AppPlatform.IOS) {
    const iosAppMetadata = appMetadata as IosAppMetadata;
    logger.info(`  - Bundle ID: ${iosAppMetadata.bundleId}`);
    if (iosAppMetadata.appStoreId) {
      logger.info(`  - App Store ID: ${iosAppMetadata.appStoreId}`);
    }
  } else if (appPlatform === AppPlatform.ANDROID) {
    logger.info(`  - Package name: ${(appMetadata as AndroidAppMetadata).packageName}`);
  }

  logger.info("");
  logger.info("You can run this command to print out your new app's Google Services config:");
  logger.info(`  firebase apps:sdkconfig ${appPlatform} ${appMetadata.appId}`);
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

export const command = new Command("apps:create [platform] [displayName]")
  .description(
    "create a new Firebase app. [platform] can be IOS, ANDROID or WEB (case insensitive).",
  )
  .option("-a, --package-name <packageName>", "required package name for the Android app")
  .option("-b, --bundle-id <bundleId>", "required bundle id for the iOS app")
  .option("-s, --app-store-id <appStoreId>", "(optional) app store id for the iOS app")
  .before(requireAuth)
  .action(
    async (
      platform: string = "",
      displayName: string | undefined,
      options: any,
    ): Promise<AppMetadata> => {
      const projectId = needProjectId(options);

      if (!options.nonInteractive && !platform) {
        platform = await promptOnce({
          type: "list",
          message: "Please choose the platform of the app:",
          choices: [
            { name: "iOS", value: AppPlatform.IOS },
            { name: "Android", value: AppPlatform.ANDROID },
            { name: "Web", value: AppPlatform.WEB },
          ],
        });
      }

      const appPlatform = getAppPlatform(platform);
      if (appPlatform === AppPlatform.ANY /* platform is not provided */) {
        throw new FirebaseError("App platform must be provided");
      }

      logger.info(`Create your ${appPlatform} app in project ${clc.bold(projectId)}:`);
      options.displayName = displayName; // add displayName into options to pass into prompt function
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
          throw new FirebaseError("Unexpected error. This should not happen");
      }

      logPostAppCreationInformation(appData, appPlatform);
      return appData;
    },
  );
