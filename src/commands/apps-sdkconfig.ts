import * as ora from "ora";
import * as fs from "fs-extra";

import * as Command from "../command";
import {
  AppConfigurationData,
  AppMetadata,
  AppPlatform,
  getAppConfig,
  getAppPlatform,
  getWebAppConfig,
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
): Promise<AppMetadata | undefined> {
  if (!projectId) {
    throw new FirebaseError("Project ID must not be empty.");
  }

  const apps: AppMetadata[] = await listFirebaseApps(projectId, appPlatform);
  if (apps.length === 0) {
    if (appPlatform === AppPlatform.WEB) {
      logger.warn(
        `clc.redWarning: There is no web app associated with ${projectId}. ` +
          `You can create one with "firebase apps:create web" command `
      );
      return undefined;
    }
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

  if (appPlatform === AppPlatform.WEB) {
    choices.push({
      name: "Print configuration without a web app (not recommended)",
      value: undefined,
    });
  }

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
      let projectId = options.project;

      if (!appId && !options.nonInteractive) {
        projectId = (await getOrPromptProject(options)).projectId;

        const appMetadata = await selectAppInteractively(projectId, appPlatform);
        appId = appMetadata ? appMetadata.appId : "";
        appPlatform = appMetadata ? appMetadata.platform : appPlatform;
      }

      if (!appId && appPlatform !== AppPlatform.WEB) {
        throw new FirebaseError("App ID must not be empty for non Web apps.");
      }

      let configData;
      const spinner = ora(
        `Downloading configuration data of your Firebase ${appPlatform} app`
      ).start();
      try {
        configData = appId
          ? await getAppConfig(appId, appPlatform)
          : await getWebAppConfig(projectId);
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
