import * as clc from "cli-color";
import * as ora from "ora";
// TODO(caot): Replace with proper import
import Table = require("cli-table");

import * as Command from "../command";
import * as getProjectId from "../getProjectId";
import { listFirebaseApps } from "../management/list";
import { AppMetadata, AppPlatform } from "../management/metadata";
import * as FirebaseError from "../error";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

function logAppsList(apps: AppMetadata[]): void {
  if (apps.length > 0) {
    const tableHead = ["App Display Name", "App ID", "Platform"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    apps.forEach(({ appId, displayName, platform }) => {
      table.push([displayName || NOT_SPECIFIED, appId, platform]);
    });

    logger.info(table.toString());
  } else {
    logger.info(clc.bold("No apps found."));
  }
}

function getAppPlatform(platform: string): AppPlatform {
  switch (platform.toUpperCase()) {
    case "IOS":
      return AppPlatform.IOS;
    case "ANDROID":
      return AppPlatform.ANDROID;
    case "WEB":
      return AppPlatform.WEB;
    case "": // list all apps if platform is not provided
      return AppPlatform.ANY;
    default:
      return AppPlatform.PLATFORM_UNSPECIFIED;
  }
}

module.exports = new Command("apps:list [platform]")
  .description(
    "list the registered apps of a Firebase project\n\n" +
      "Arguments:\n" +
      "[platform] IOS, ANDROID or WEB (case insensitive)"
  )
  .before(requireAuth)
  .action(
    async (platform: string = "", options: any): Promise<AppMetadata[]> => {
      const projectId = getProjectId(options);
      const appPlatform = getAppPlatform(platform);

      if (appPlatform === AppPlatform.PLATFORM_UNSPECIFIED) {
        throw new FirebaseError("Unexpected platform. Only support iOS, Android and Web apps");
      }

      let apps;
      const spinner = ora(
        "Preparing the list of your Firebase" +
          `${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps`
      ).start();
      try {
        apps = await listFirebaseApps(projectId, appPlatform);
      } catch (err) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logAppsList(apps);
      return apps;
    }
  );
