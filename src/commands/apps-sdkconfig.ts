import * as ora from "ora";
import * as fs from "fs-extra";

import * as Command from "../command";
import {
  AppMetadata,
  AppPlatform,
  getAppConfig,
  getAppPlatform,
  listFirebaseApps,
} from "../management/apps";
import { getOrPromptDesiredProject } from "../management/projects";
import * as FirebaseError from "../error";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";
import { promptOnce } from "../prompt";

async function selectAppInteractively(
  projectId: string,
  appPlatform: AppPlatform
): Promise<AppMetadata> {
  const apps: AppMetadata[] = await listFirebaseApps(projectId, appPlatform);
  if (apps.length === 0) {
    throw new FirebaseError("There is no app associated with this Firebase project");
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
    "print the configuration of a Firebase app. " +
      "[platform] can be IOS, ANDROID or WEB (case insensitive)"
  )
  .option("-o, --out", "(optional) write config output to a file")
  .before(requireAuth)
  .action(
    async (platform: string = "", appId: string = "", options: any): Promise<any> => {
      let appPlatform = getAppPlatform(platform);

      if (appPlatform === AppPlatform.PLATFORM_UNSPECIFIED) {
        throw new FirebaseError("Unexpected platform. Only support iOS, Android and Web apps.");
      }

      if (!appId) {
        if (options.nonInteractive) {
          throw new FirebaseError("App ID must not be empty.");
        }

        const { projectId } = await getOrPromptDesiredProject(options);

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

      const { fileName, fileContents } = configData;
      if (!options.out) {
        logger.info(fileContents);
        return configData;
      }

      let overwrite = true;
      if (fs.existsSync(fileName)) {
        if (options.nonInteractive) {
          throw new FirebaseError(`${fileName} already exists`);
        }
        overwrite = await promptOnce({
          type: "confirm",
          message: `${fileName} already exists. Do you want to overwrite?`,
        });
      }

      if (overwrite) {
        fs.writeFileSync(fileName, fileContents);
        logger.info(`App configuration is written in ${fileName}`);
      }

      return configData;
    }
  );
