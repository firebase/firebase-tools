import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import {
  AppPlatform,
  checkForApps,
  listFirebaseApps,
  selectAppInteractively,
} from "../management/apps";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { setupCrashlyticsWeb, SetupWebResult } from "../crashlytics/onboarding";
import { Options } from "../options";

export interface CrashlyticsSetupOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:setup [appId]")
  .description("set up a Firebase web app for Crashlytics")
  .option("--app <appID>", "the app id of your Firebase app")
  .before(requireAuth)
  .action(
    async (
      appIdInput = "",
      options: CrashlyticsSetupOptions,
    ): Promise<SetupWebResult | undefined> => {
      const projectId = needProjectId(options);
      let appId: string = appIdInput ?? options.app ?? "";

      let appPlatform: AppPlatform = AppPlatform.ANY;
      if (!appId) {
        const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
        checkForApps(apps, AppPlatform.ANY);
        if (apps.length === 1) {
          appId = apps[0].appId;
          appPlatform = apps[0].platform;
        } else if (options.nonInteractive) {
          throw new FirebaseError(
            `Project ${projectId} has multiple apps, must specify an app id.`,
          );
        } else {
          const appMetadata = await selectAppInteractively(apps, AppPlatform.ANY);
          appId = appMetadata.appId;
          appPlatform = appMetadata.platform;
        }
      } else {
        const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
        const matchedApp = apps.find((a) => a.appId === appId);
        if (matchedApp) {
          appPlatform = matchedApp.platform;
        } else if (appId.includes(":web:")) {
          appPlatform = AppPlatform.WEB;
        } else if (appId.includes(":android:")) {
          appPlatform = AppPlatform.ANDROID;
        } else if (appId.includes(":ios:")) {
          appPlatform = AppPlatform.IOS;
        }
      }

      if (appPlatform !== AppPlatform.WEB && !appId.includes(":web:")) {
        logger.info(
          `Crashlytics set up via the CLI is currently only supported for Web apps. No setup steps needed for non-Web app: ${appId}`,
        );
        return undefined;
      }

      return await setupCrashlyticsWeb(projectId, appId, options);
    },
  );
