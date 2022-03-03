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
import { promptOnce } from "../prompt";

async function selectAppInteractively(
  apps: AppMetadata[],
  appPlatform: AppPlatform
): Promise<AppMetadata> {
  if (apps.length === 0) {
    throw new FirebaseError(
      `There are no ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps ` +
        "associated with this Firebase project"
    );
  }

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

module.exports = new Command("apps:sdkconfig [platform] [appId]")
  .description(
    "print the Google Services config of a Firebase app. " +
      "[platform] can be IOS, ANDROID or WEB (case insensitive)"
  )
  .option("-o, --out [file]", "(optional) write config output to a file")
  .before(requireAuth)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (platform = "", appId = "", options: any): Promise<AppConfigurationData> => {
      let appPlatform = getAppPlatform(platform);

      if (!appId) {
        let projectId = needProjectId(options);
        if (options.nonInteractive && !projectId) {
          throw new FirebaseError("Must supply app and project ids in non-interactive mode.");
        } else if (!projectId) {
          const result = await getOrPromptProject(options);
          projectId = result.projectId;
        }

        const apps = await listFirebaseApps(projectId, appPlatform);
        // if there's only one app, we don't need to prompt interactively
        if (apps.length === 1) {
          appId = apps[0].appId;
          appPlatform = apps[0].platform;
        } else if (options.nonInteractive) {
          throw new FirebaseError(
            `Project ${projectId} has multiple apps, must specify an app id.`
          );
        } else {
          const appMetadata: AppMetadata = await selectAppInteractively(apps, appPlatform);
          appId = appMetadata.appId;
          appPlatform = appMetadata.platform;
        }
      }

      let configData;
      const spinner = ora(
        `Downloading configuration data of your Firebase ${appPlatform} app`
      ).start();
      try {
        configData = await getAppConfig(appId, appPlatform);
      } catch (err: any) {
        spinner.fail();
        throw err;
      }
      spinner.succeed();

      const fileInfo = getAppConfigFile(configData, appPlatform);
      if (appPlatform === AppPlatform.WEB) {
        fileInfo.sdkConfig = configData;
      }

      if (options.out === undefined) {
        logger.info(fileInfo.fileContents);
        return fileInfo;
      }

      const shouldUseDefaultFilename = options.out === true || options.out === "";
      const filename = shouldUseDefaultFilename ? configData.fileName : options.out;
      if (fs.existsSync(filename)) {
        if (options.nonInteractive) {
          throw new FirebaseError(`${filename} already exists`);
        }
        const overwrite = await promptOnce({
          type: "confirm",
          default: false,
          message: `${filename} already exists. Do you want to overwrite?`,
        });

        if (!overwrite) {
          return configData;
        }
      }

      fs.writeFileSync(filename, fileInfo.fileContents);
      logger.info(`App configuration is written in ${filename}`);

      return configData;
    }
  );
