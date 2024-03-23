import * as clc from "colorette";
import * as ora from "ora";
const Table = require("cli-table");

import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { AppMetadata, AppPlatform, getAppPlatform, listFirebaseApps } from "../management/apps";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

function logAppsList(apps: AppMetadata[]): void {
  if (apps.length === 0) {
    logger.info(clc.bold("No apps found."));
    return;
  }
  const tableHead = ["App Display Name", "App ID", "Platform"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  apps.forEach(({ appId, displayName, platform }) => {
    table.push([displayName || NOT_SPECIFIED, appId, platform]);
  });

  logger.info(table.toString());
}

function logAppCount(count: number = 0): void {
  if (count === 0) {
    return;
  }
  logger.info("");
  logger.info(`${count} app(s) total.`);
}

export const command = new Command("apps:list [platform]")
  .description(
    "list the registered apps of a Firebase project. " +
      "Optionally filter apps by [platform]: IOS, ANDROID or WEB (case insensitive)",
  )
  .before(requireAuth)
  .action(async (platform: string | undefined, options: any): Promise<AppMetadata[]> => {
    const projectId = needProjectId(options);
    const appPlatform = getAppPlatform(platform || "");

    let apps;
    const spinner = ora(
      "Preparing the list of your Firebase " +
        `${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps`,
    ).start();
    try {
      apps = await listFirebaseApps(projectId, appPlatform);
    } catch (err: any) {
      spinner.fail();
      throw err;
    }

    spinner.succeed();
    logAppsList(apps);
    logAppCount(apps.length);
    return apps;
  });
