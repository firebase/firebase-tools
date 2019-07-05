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

module.exports = new Command("apps:list [platform]")
  .description(
    "list the registered apps of a Firebase project\n\n" +
      "Arguments:\n" +
      "[platform] IOS, ANDROID or WEB (case insensitive)"
  )
  .before(requireAuth)
  .action(
    async (platform: AppPlatform | string = "", options: any): Promise<AppMetadata[]> => {
      const projectId = getProjectId(options);


      if (platform && !(AppPlatform as any)[platform.toUpperCase()]) {
        throw new FirebaseError("Unexpected platform. Only support iOS, Android and Web apps");
      } else {
        platform = platform.toUpperCase();
      }

      const spinner = ora(`Preparing the list of your Firebase ${platform} apps`).start();
      try {
        const apps = await listFirebaseApps(projectId, platform as AppPlatform);
        spinner.succeed();
        logAppsList(apps);
        return apps;
      } catch (err) {
        spinner.fail();
        throw err;
      }
    }
  );
