import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { updateDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { input } from "../prompt";
import { Options } from "../options";

interface AppCheckDebugTokensUpdateOptions extends Options {
  displayName?: string;
}

export const command = new Command("appcheck:debugtokens:update <appId> <debugTokenId>")
  .description("update the display name of a Firebase App Check debug token for an app")
  .option("--display-name <displayName>", "new display name for the debug token")
  .before(requireAuth)
  .action(
    async (
      appId: string,
      debugTokenId: string,
      options: AppCheckDebugTokensUpdateOptions,
    ): Promise<DebugToken> => {
      const projectNumber = await needProjectNumber(options);
      let displayName = options.displayName;
      if (!displayName) {
        displayName = await input({
          message: "What would you like to rename your debug token to?",
          nonInteractive: options.nonInteractive,
        });
      }

      let debugTokenName = debugTokenId;
      if (!debugTokenName.startsWith("projects/")) {
        debugTokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${debugTokenId}`;
      }

      const result = await promiseWithSpinner<DebugToken>(
        async () => await updateDebugToken(debugTokenName, displayName!),
        `Updating App Check debug token ${clc.bold(debugTokenName)}`,
      );

      logSuccess(`Successfully updated App Check debug token ${clc.bold(result.displayName)}`);
      return result;
    },
  );
