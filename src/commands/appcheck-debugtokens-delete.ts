import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { deleteDebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import { Options } from "../options";

export const command = new Command("appcheck:debugtokens:delete <appId> <debugTokenId>")
  .description("delete a Firebase App Check debug token for an app")
  .option("--force", "attempt to delete debug token without prompting for confirmation")
  .before(requireAuth)
  .action(async (appId: string, debugTokenId: string, options: Options): Promise<void> => {
    const projectNumber = await needProjectNumber(options);

    let debugTokenName = debugTokenId;
    if (!debugTokenName.startsWith("projects/")) {
      debugTokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${debugTokenId}`;
    }

    if (!options.force) {
      const confirmMessage = `You are about to delete App Check debug token ${clc.bold(debugTokenName)}. Do you wish to continue?`;
      const consent = await confirm({
        message: confirmMessage,
        force: options.force,
        nonInteractive: options.nonInteractive,
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
