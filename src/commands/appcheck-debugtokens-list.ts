import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { listDebugTokens, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";
import { FirebaseError } from "../error";

function logDebugTokensList(debugTokens: DebugToken[]): void {
  if (debugTokens.length === 0) {
    logger.info(clc.bold("No App Check debug tokens found."));
    return;
  }
  const tableHead = ["Display Name", "Resource Name", "Update Time"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  debugTokens.forEach(({ displayName, name, updateTime }) => {
    table.push([displayName, name, updateTime || "N/A"]);
  });

  logger.info(table.toString());
}

export const command = new Command("appcheck:debugtokens:list")
  .description("list all Firebase App Check debug tokens for an app")
  .option("--app <appId>", "the app id of your Firebase app")
  .before(requireAuth)
  .action(async (options: any): Promise<DebugToken[]> => {
    const appId = options.app;
    if (!appId) {
      throw new FirebaseError("Must specify an App ID using --app.");
    }
    const projectNumber = await needProjectNumber(options);

    const debugTokens = await promiseWithSpinner<DebugToken[]>(
      async () => await listDebugTokens(projectNumber, appId),
      `Listing App Check debug tokens for app ${clc.bold(appId)}`,
    );

    logDebugTokensList(debugTokens);
    return debugTokens;
  });
