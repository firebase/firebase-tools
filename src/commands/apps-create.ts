import * as clc from "cli-color";
import * as ora from "ora";

import * as Command from "../command";
import * as getProjectId from "../getProjectId";
import * as FirebaseError from "../error";
import { AppPlatform, createAndroidApp, createIosApp, createWebApp } from "../management/apps";
import { prompt, promptOnce, Question } from "../prompt";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";

const DISPLAY_NAME_QUESTION: Question = {
  type: "input",
  name: "displayName",
  default: "",
  message: "What would you like to call your app?",
};

function logPostAppCreationInformation(
  appMetadata: {
    appId: string;
    displayName: string;
    bundleId?: string;
    packageName?: string;
    appStoreId?: string;
  },
  appPlatform: AppPlatform
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
    logger.info(`  - Bundle ID: ${appMetadata.bundleId}`);
    if (appMetadata.appStoreId) {
      logger.info(`  - App Store ID: ${appMetadata.appStoreId}`);
    }
  } else if (appPlatform === AppPlatform.ANDROID) {
    logger.info(`  - Package name: ${appMetadata.packageName}`);
  }

  // TODO(caot): Uncomment this after apps:sdkconfig command is implemented
  // logger.info("");
  // logger.info("Run this command to print out your config file:");
  // logger.info(`  firebase apps:sdkconfig ${appMetadata.appId}`);
}

async function initiateIosAppCreation(options: {
  project: string;
  nonInteractive: boolean;
  displayName?: string;
  bundleId?: string;
  appStoreId?: string;
}): Promise<any> {
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
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

async function initiateAndroidAppCreation(options: {
  project: string;
  nonInteractive: boolean;
  displayName: string;
  packageName: string;
}): Promise<any> {
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
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

async function initiateWebAppCreation(options: {
  project: string;
  nonInteractive: boolean;
  displayName: string;
}): Promise<any> {
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
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

module.exports = new Command("apps:create [platform] [displayName]")
  .description(
    "create a new Firebase app\n\n" +
      "Arguments:\n" +
      "[platform] IOS, ANDROID or WEB\n" +
      "[displayName] the display name of the app"
  )
  .option("-a, --package-name <packageName>", "required package name for the Android app")
  .option("-b, --bundle-id <bundleId>", "required bundle id for the iOS app")
  .option("-s, --app-store-id <appStoreId>", "(optional) app store id for the iOS app")
  .before(requireAuth)
  .action(
    async (
      platform: AppPlatform | string | undefined,
      displayName: string | undefined,
      options: any
    ): Promise<any> => {
      const projectId = getProjectId(options);

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
      if (!platform) {
        throw new FirebaseError("App platform must be provided");
      } else if (!(AppPlatform as any)[platform.toUpperCase()]) {
        throw new FirebaseError("Unexpected platform. Only support iOS, Android and Web apps");
      } else {
        platform = platform.toUpperCase();
      }

      logger.info(`Create your ${platform} app in project ${clc.bold(options.project)}:`);
      options.displayName = displayName; // add displayName into options to pass into prompt function
      let appData;
      switch (platform) {
        case AppPlatform.IOS:
          appData = await initiateIosAppCreation(options);
          break;
        case AppPlatform.ANDROID:
          appData = await initiateAndroidAppCreation(options);
          break;
        case AppPlatform.WEB:
          appData = await initiateWebAppCreation(options);
          break;
      }

      logPostAppCreationInformation(appData, platform as AppPlatform);
      return appData;
    }
  );
