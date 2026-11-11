import * as ora from "ora";
import * as fs from "fs-extra";

import { Command } from "../command";
import {
  AppConfig,
  AppConfigurationData,
  AppMetadata,
  AppPlatform,
  checkForApps,
  getAppConfig,
  getAppConfigFile,
  getAppPlatform,
  listFirebaseApps,
  selectAppInteractively,
} from "../management/apps";
import { needProjectId } from "../projectUtils";
import { getOrPromptProject } from "../management/projects";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { Options } from "../options";
import { confirm } from "../prompt";

export interface AppsSdkConfigOptions extends Options {
  out?: string | boolean;
}

export const command = new Command("apps:sdkconfig [platform] [appId]")
  .description(
    "print the Google Services config of a Firebase app. " +
      "[platform] can be IOS, ANDROID or WEB (case insensitive); if omitted, apps on all platforms are considered. " +
      "If [appId] is omitted, the only matching app is used automatically (even with --non-interactive), " +
      "otherwise you are prompted to select one. To pass [appId], you must specify [platform] first",
  )
  .option(
    "-o, --out [file]",
    "write config output to a file instead of stdout (defaults to the platform's standard filename, e.g. google-services.json)",
  )
  .before(requireAuth)
  .action(
    async (
      platform = "",
      appId = "",
      options: AppsSdkConfigOptions,
    ): Promise<AppConfigurationData> => {
      let appPlatform: AppPlatform;
      try {
        appPlatform = getAppPlatform(platform);
      } catch (err: unknown) {
        throw new FirebaseError(
          `Unexpected platform "${String(platform)}". [platform] must be IOS, ANDROID, or WEB. ` +
            "To specify an app ID, pass the platform first: firebase apps:sdkconfig <platform> <appId>",
          { exit: 1, original: err instanceof Error ? err : undefined },
        );
      }

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
          throw new FirebaseError(
            `Project ${projectId} has multiple apps, must specify an app id. ` +
              "Run firebase apps:list to find it, then run: firebase apps:sdkconfig <platform> <appId>",
            { exit: 1 },
          );
        } else {
          // > 1, ask what the user wants.
          const appMetadata: AppMetadata = await selectAppInteractively(apps, appPlatform);
          appId = appMetadata.appId;
          appPlatform = appMetadata.platform;
        }
      }

      let configData: AppConfig;
      const spinner = ora(
        `Downloading configuration data of your Firebase ${appPlatform} app`,
      ).start();
      try {
        configData = await getAppConfig(appId, appPlatform);
      } catch (err: unknown) {
        spinner.fail();
        throw err;
      }
      spinner.succeed();

      const fileInfo = getAppConfigFile(configData, appPlatform);
      if (appPlatform === AppPlatform.WEB) {
        fileInfo.sdkConfig = configData;
      }

      // Note: options.out can only be true (when -o with no args is passed in)
      // or a string, or undefined.
      if (options.out === undefined) {
        logger.info(fileInfo.fileContents);
        return fileInfo;
      }

      const shouldUseDefaultFilename = options.out === true || options.out === "";
      const filename = shouldUseDefaultFilename ? fileInfo.fileName : (options.out as string);
      if (fs.existsSync(filename)) {
        if (options.nonInteractive) {
          throw new FirebaseError(`${filename} already exists`);
        }
        const overwrite = await confirm(`${filename} already exists. Do you want to overwrite?`);

        if (!overwrite) {
          return fileInfo;
        }
      }

      fs.writeFileSync(filename, fileInfo.fileContents);
      logger.info(`App configuration is written in ${filename}`);

      return fileInfo;
    },
  );
