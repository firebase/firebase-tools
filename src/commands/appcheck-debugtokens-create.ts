import * as clc from "colorette";
import { v4 as uuidv4 } from "uuid";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { createDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { input } from "../prompt";
import { Options } from "../options";

interface AppCheckDebugTokensCreateOptions extends Options {
  displayName?: string;
}

export const command = new Command("appcheck:debugtoken:create <appId> [debugToken]")
  .description("create a Firebase App Check debug token for an app")
  .option("--display-name <displayName>", "display name for the debug token")
  .before(requireAuth)
  .action(
    async (
      appId: string,
      debugToken: string | undefined,
      options: AppCheckDebugTokensCreateOptions,
    ): Promise<DebugToken> => {
      const projectNumber = await needProjectNumber(options);
      let displayName = options.displayName;
      if (!displayName) {
        if (options.nonInteractive) {
          displayName = "MyDebugToken";
        } else {
          displayName = await input({
            message: "What would you like to call your debug token?",
            default: "MyDebugToken",
          });
        }
      }

      const token = debugToken || uuidv4();

      const result = await promiseWithSpinner<DebugToken>(
        async () => await createDebugToken(projectNumber, appId, displayName, token),
        `Creating App Check debug token for app ${clc.bold(appId)}`,
      );

      logSuccess(`Successfully created App Check debug token '${clc.bold(result.displayName)}':
      ${clc.bold(clc.green(token))}`);
      return result;
    },
  );
