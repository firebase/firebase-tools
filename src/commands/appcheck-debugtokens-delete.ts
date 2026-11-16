import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { deleteDebugTokenAndCleanLocal } from "../appcheck/debugTokens";
import { getLocalConfigPath } from "../appcheck/localConfig";
import { AppCheckDebugOptions } from "../appcheck/types";
import { getOrPromptProjectAndAppId } from "./appcheck-prompts";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import { logger } from "../logger";

export const command = new Command("appcheck:debugtokens:delete <debugTokenId>")
  .description("delete a Firebase App Check debug token for an app")
  .help(
    `deletes a server-registered Firebase App Check debug token for an app (accepting either the short \`<debugTokenId>\` or the full \`projects/<projectNumber>/apps/<appId>/debugTokens/<debugTokenId>\` resource name) and removes the matching entry from ~/.config/configstore/firebase-appcheck.json if present.`,
  )
  .option("--app <appId>", "the app id of your Firebase app")
  .withForce("attempt to delete debug token without prompting for confirmation")
  .before((options: AppCheckDebugOptions) => requireAuth(options))
  .action(async (debugTokenId: string, options: AppCheckDebugOptions): Promise<void> => {
    let inferredAppId: string | undefined;
    if (debugTokenId.startsWith("projects/")) {
      const match = /^projects\/[^/]+\/apps\/([^/]+)\/debugTokens\/[^/]+$/.exec(debugTokenId);
      if (match) {
        inferredAppId = match[1];
      }
    }
    const { appId } = await getOrPromptProjectAndAppId(
      { ...options, app: options.app || inferredAppId },
      "Select the app to delete a debug token from:",
    );
    const projectNumber = await needProjectNumber(options);

    let debugTokenName = debugTokenId;
    if (!debugTokenName.startsWith("projects/")) {
      debugTokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${debugTokenId}`;
    } else {
      const expectedPrefix = `projects/${projectNumber}/apps/${appId}/debugTokens/`;
      if (!debugTokenName.startsWith(expectedPrefix)) {
        throw new FirebaseError(
          `Debug token ${debugTokenId} does not belong to app ${appId} in project ${projectNumber}. ` +
            `Pass --app <appId> for the matching app or run "firebase appcheck:debugtokens:list" to view valid debug tokens.`,
          { exit: 1 },
        );
      }
    }

    if (!options.force) {
      if (options.nonInteractive) {
        throw new FirebaseError("Must pass --force to delete in non-interactive mode.", {
          exit: 1,
        });
      }
      const confirmMessage = `You are about to delete App Check debug token ${clc.bold(debugTokenName)}. Do you wish to continue?`;
      const consent = await confirm({
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Delete App Check debug token canceled.", { exit: 1 });
      }
    }

    const removedLocal = await promiseWithSpinner<boolean>(
      () => deleteDebugTokenAndCleanLocal({ appId, debugTokenName }),
      `Deleting App Check debug token ${clc.bold(debugTokenName)}`,
    );

    logSuccess(`Successfully deleted App Check debug token ${clc.bold(debugTokenName)}`);
    if (removedLocal) {
      logger.info(
        `Removed matching debug token from local config: ${clc.bold(getLocalConfigPath())}`,
      );
    }
  });
