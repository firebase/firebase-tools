import * as ora from "ora";
import * as fs from "fs-extra";

import * as Command from "../command";
import {
  AppConfigurationData,
  AppMetadata,
  AppPlatform,
  getAppConfig,
  getAppPlatform,
  listFirebaseApps,
} from "../management/apps";
import { getOrPromptProject } from "../management/projects";
import { FirebaseError } from "../error";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";
import { promptOnce } from "../prompt";

async function selectAppInteractively(
  projectId: string,
  appPlatform: AppPlatform
): Promise<AppMetadata> {
  if (!projectId) {
    throw new FirebaseError("Project ID must not be empty.");
  }

  const apps: AppMetadata[] = await listFirebaseApps(projectId, appPlatform);
  if (apps.length === 0) {
    throw new FirebaseError(
      `There are no ${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps ` +
        "associated with this Firebase project"
    );
  }

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
    name: "id",
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
    async (
      platform: string = "",
      appId: string = "",
      options: any
    ): Promise<AppConfigurationData> => {
      let appPlatform = getAppPlatform(platform);

      if (!appId) {
        if (options.nonInteractive) {
          throw new FirebaseError("App ID must not be empty.");
        }

        const { projectId } = await getOrPromptProject(options);

        const appMetadata: AppMetadata = await selectAppInteractively(projectId, appPlatform);
        appId = appMetadata.appId;
        appPlatform = appMetadata.platform;
      }

      let configData;
      const spinner = ora(
        `Downloading configuration data of your Firebase ${appPlatform} app`
      ).start();
      try {
        configData = await getAppConfig(appId, appPlatform);
      } catch (err) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logger.info("");
      logger.info(`=== Your app configuration is ready ===`);
      logger.info("");

      if (options.out === undefined) {
        logger.info(configData.fileContents);
        return configData;
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

      fs.writeFileSync(filename, configData.fileContents);
      logger.info(`App configuration is written in ${filename}`);

      return configData;
    }
  );
