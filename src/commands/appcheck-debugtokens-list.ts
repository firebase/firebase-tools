import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { listDebugTokens } from "../appcheck/api";
import { formatLocalTokenStatus, inspectLocalDebugTokens } from "../appcheck/debugTokens";
import { DebugToken, AppCheckDebugOptions, LocalDebugTokenEntry } from "../appcheck/types";
import { getOrPromptProjectAndAppId } from "./appcheck-prompts";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";

function logServerDebugTokensList(debugTokens: readonly DebugToken[]): void {
  if (debugTokens.length === 0) {
    logger.info(clc.bold("No App Check debug tokens found."));
    return;
  }
  const table = new Table({
    head: ["Display Name", "Resource Name", "Update Time"],
    style: { head: ["green"] },
  });
  for (const { displayName, name, updateTime } of debugTokens) {
    table.push([displayName, name, updateTime || "N/A"]);
  }

  logger.info(table.toString());
}

function logLocalDebugTokensList(entries: readonly LocalDebugTokenEntry[]): void {
  if (entries.length === 0) {
    logger.info(clc.bold("No local App Check debug tokens found."));
    return;
  }
  const table = new Table({
    head: ["App ID", "Token Prefix", "Server Status"],
    style: { head: ["green"] },
  });
  for (const entry of entries) {
    table.push([entry.appId, entry.tokenPrefix, formatLocalTokenStatus(entry.status)]);
  }

  logger.info(table.toString());
}

export const command = new Command("appcheck:debugtokens:list")
  .description("list Firebase App Check debug tokens for an app or stored locally on this machine")
  .help(
    `lists server-registered Firebase App Check debug tokens for an app, or passes \`--local\` to inspect debug tokens saved in ~/.config/configstore/firebase-appcheck.json on this machine (optionally filtered by \`--app\`).`,
  )
  .option("--app <appId>", "the app id of your Firebase app")
  .option(
    "--local",
    "list debug tokens stored locally on this machine instead of querying all server tokens for an app",
  )
  .before((options: AppCheckDebugOptions) => {
    if (options.local) {
      return;
    }
    return requireAuth(options);
  })
  .action(async (options: AppCheckDebugOptions): Promise<DebugToken[] | LocalDebugTokenEntry[]> => {
    if (options.local) {
      const localEntries = await inspectLocalDebugTokens(options);
      logLocalDebugTokensList(localEntries);
      return localEntries;
    }

    const { appId } = await getOrPromptProjectAndAppId(
      options,
      "Select the app to list debug tokens for:",
    );
    const projectNumber = await needProjectNumber(options);

    const debugTokens = await promiseWithSpinner<DebugToken[]>(
      () => listDebugTokens(projectNumber, appId),
      `Listing App Check debug tokens for app ${clc.bold(appId)}`,
    );

    logServerDebugTokensList(debugTokens);
    return debugTokens;
  });
