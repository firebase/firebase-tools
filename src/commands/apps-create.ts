import * as clc from "colorette";

import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import {
  AndroidAppMetadata,
  AppMetadata,
  AppPlatform,
  getAppPlatform,
  IosAppMetadata,
  sdkInit,
  SdkInitOptions,
  WebAppMetadata,
} from "../management/apps";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { Options } from "../options";
import { confirm, select } from "../prompt";
import { errNoDefaultSite, getDefaultHostingSite } from "../getDefaultHostingSite";
import { pickHostingSiteName } from "../hosting/interactive";
import { createSite } from "../hosting/api";
import { logSuccess } from "../utils";

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

interface AppsCreateOptions extends Options {
  packageName: string;
  bundleId: string;
  appStoreId: string;
}

export const command = new Command("apps:create [platform] [displayName]")
  .description(
    "create a new Firebase app. [platform] can be IOS, ANDROID or WEB (case insensitive)",
  )
  .option("-a, --package-name <packageName>", "required package name for the Android app")
  .option("-b, --bundle-id <bundleId>", "required bundle id for the iOS app")
  .option("-s, --app-store-id <appStoreId>", "(optional) app store id for the iOS app")
  .before(requireAuth)
  .action(
    async (
      platform = "",
      displayName: string | undefined,
      options: AppsCreateOptions,
    ): Promise<AppMetadata> => {
      const projectId = needProjectId(options);

      let chosenPlatform: string = typeof platform === "string" ? platform : "";
      if (!options.nonInteractive && !chosenPlatform) {
        chosenPlatform = await select<AppPlatform>({
          message: "Please choose the platform of the app:",
          choices: [
            { name: "iOS", value: AppPlatform.IOS },
            { name: "Android", value: AppPlatform.ANDROID },
            { name: "Web", value: AppPlatform.WEB },
          ],
        });
      }

      const appPlatform = getAppPlatform(chosenPlatform);
      if (appPlatform === AppPlatform.ANY /* platform is not provided */) {
        throw new FirebaseError("App platform must be provided");
      }

      logger.info(`Create your ${appPlatform} app in project ${clc.bold(projectId)}:`);

      let newSiteId: string | undefined;
      if (appPlatform === AppPlatform.WEB) {
        const existingSite = await getDefaultHostingSite({ projectId }).catch((err: unknown) => {
          if (err !== errNoDefaultSite) {
            throw err;
          }
        });

        if (existingSite) {
          logger.info(`Firebase Hosting site is present: ${clc.bold(existingSite)}.`);
        } else if (
          await confirm({
            message:
              "A Firebase Hosting site is required for Web apps. Would you like to create a default site now?",
            default: true,
            nonInteractive: options.nonInteractive,
          })
        ) {
          newSiteId = await pickHostingSiteName("", {
            projectId,
            nonInteractive: options.nonInteractive,
          });
        }
      }

      options.displayName = displayName; // add displayName into options to pass into prompt function
      const appData = await sdkInit(appPlatform, options as SdkInitOptions);
      if (newSiteId) {
        await createSite(projectId, newSiteId, appData.appId);
        logger.info("");
        logSuccess(`Firebase Hosting site ${newSiteId} created!`);
      }
      logPostAppCreationInformation(appData, appPlatform);
      return appData;
    },
  );
