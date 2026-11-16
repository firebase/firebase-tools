import * as clc from "colorette";

import { Command } from "../command";
import { findStaleLocalDebugTokens, formatLocalTokenStatus } from "../appcheck/debugTokens";
import { getAllLocalTokens, getLocalConfigPath, removeLocalTokens } from "../appcheck/localConfig";
import {
  AppCheckDebugOptions,
  LocalDebugTokenEntry,
  PruneDebugTokensResult,
} from "../appcheck/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { confirm } from "../prompt";
import { requireAuth } from "../requireAuth";
import { logSuccess, promiseWithSpinner } from "../utils";

function logServerTokensUntouchedNote(): void {
  logger.info(
    `Server-registered debug tokens are untouched. Manage server tokens with ${clc.bold("firebase appcheck:debugtokens:list")} and ${clc.bold("firebase appcheck:debugtokens:delete")}.`,
  );
}

export const command = new Command("appcheck:debugtokens:prune")
  .description("remove stale App Check debug tokens from the local machine config")
  .help(
    `removes stale App Check debug token entries from ~/.config/configstore/firebase-appcheck.json (and $XDG_CONFIG_HOME/configstore/firebase-appcheck.json when $XDG_CONFIG_HOME is set) on this machine whose Firebase app has been deleted from the active project or whose debug token has been revoked on the server.

This command only modifies the local machine config (~/.config/configstore/firebase-appcheck.json and any $XDG_CONFIG_HOME mirror); server-registered debug tokens are untouched and can be managed via \`firebase appcheck:debugtokens:list\` and \`firebase appcheck:debugtokens:delete\`.`,
  )
  .withForce("remove stale local debug tokens without prompting")
  .before((options: AppCheckDebugOptions) => requireAuth(options))
  .action(async (options: AppCheckDebugOptions): Promise<PruneDebugTokensResult> => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    if (Object.keys(getAllLocalTokens()).length === 0) {
      logger.info(clc.bold("No local App Check debug tokens found."));
      logServerTokensUntouchedNote();
      return { prunedAppIds: [] };
    }

    const staleEntries = await promiseWithSpinner<LocalDebugTokenEntry[]>(
      () => findStaleLocalDebugTokens({ projectId, projectNumber }),
      `Checking local App Check debug tokens against project ${clc.bold(projectId)}`,
    );

    if (staleEntries.length === 0) {
      logger.info(
        clc.bold(`No stale local App Check debug tokens found for project ${projectId}.`),
      );
      logServerTokensUntouchedNote();
      return { prunedAppIds: [] };
    }

    logger.info(
      `Found ${staleEntries.length} stale local debug token(s) in ${clc.bold(getLocalConfigPath())}:`,
    );
    for (const entry of staleEntries) {
      logger.info(
        `  - ${clc.bold(entry.appId)} (${entry.tokenPrefix}): ${formatLocalTokenStatus(entry.status)}`,
      );
    }
    logServerTokensUntouchedNote();

    if (!options.force) {
      if (options.nonInteractive) {
        throw new FirebaseError(
          "Must pass --force to prune stale local debug tokens in non-interactive mode.",
          { exit: 1 },
        );
      }
      const consent = await confirm({
        message: `Remove ${staleEntries.length} stale local debug token(s) from ${getLocalConfigPath()}?`,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Prune local App Check debug tokens canceled.", { exit: 1 });
      }
    }

    const prunedAppIds = staleEntries.map((entry) => entry.appId);
    removeLocalTokens(prunedAppIds);
    logSuccess(
      `Pruned ${prunedAppIds.length} stale local App Check debug token(s) from ${clc.bold(getLocalConfigPath())}: ${prunedAppIds.join(", ")}`,
    );
    return { prunedAppIds };
  });
