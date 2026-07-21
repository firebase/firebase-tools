import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { deleteDebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";

import { AppCheckDebugOptions, getOrPromptProjectAndAppId } from "./appcheck-debugtokens-utils";

export const command = new Command("appcheck:debugtokens:delete <debugTokenId>")
  .description("delete a Firebase App Check debug token for an app")
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--force", "attempt to delete debug token without prompting for confirmation")
  .before(requireAuth)
  .action(async (debugTokenId: string, options: AppCheckDebugOptions): Promise<void> => {
    const { appId } = await getOrPromptProjectAndAppId(options);
    const projectNumber = await needProjectNumber(options);

    let debugTokenName = debugTokenId;
    if (!debugTokenName.startsWith("projects/")) {
      debugTokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${debugTokenId}`;
    } else {
      const expectedPrefix = `projects/${projectNumber}/apps/${appId}/debugTokens/`;
      if (!debugTokenName.startsWith(expectedPrefix)) {
        throw new FirebaseError(
          `Debug token ${debugTokenId} does not belong to app ${appId} in project ${projectNumber}`,
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
        throw new FirebaseError("Delete App Check debug token canceled.");
      }
    }

    await promiseWithSpinner<void>(
      async () => await deleteDebugToken(debugTokenName),
      `Deleting App Check debug token ${clc.bold(debugTokenName)}`,
    );

    logSuccess(`Successfully deleted App Check debug token ${clc.bold(debugTokenName)}`);
  });
