/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as clc from "cli-color";
import * as ora from "ora";
import Table = require("cli-table");

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
      "Optionally filter apps by [platform]: IOS, ANDROID or WEB (case insensitive)"
  )
  .before(requireAuth)
  .action(async (platform: string | undefined, options: any): Promise<AppMetadata[]> => {
    const projectId = needProjectId(options);
    const appPlatform = getAppPlatform(platform || "");

    let apps;
    const spinner = ora(
      "Preparing the list of your Firebase " +
        `${appPlatform === AppPlatform.ANY ? "" : appPlatform + " "}apps`
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
