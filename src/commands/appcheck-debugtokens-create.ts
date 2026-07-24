/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as clc from "colorette";
import { randomUUID } from "node:crypto";
import * as os from "os";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { createDebugToken, listDebugTokens, deleteDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess } from "../utils";
import { FirebaseError } from "../error";
import { confirm, input } from "../prompt";

import { AppCheckDebugOptions, getOrPromptProjectAndAppId } from "./appcheck-debugtokens-utils";

export const command = new Command("appcheck:debugtokens:create [debugToken]")
  .description("generate and register an App Check debug token for an app")
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--display-name <displayName>", "display name for the debug token")
  .option(
    "--force",
    "overwrite existing debug token if it has the same display name without prompting",
  )
  .before(requireAuth)
  .action(
    async (
      debugToken: string | undefined,
      options: AppCheckDebugOptions,
    ): Promise<DebugToken | void> => {
      const token = debugToken || randomUUID();

      const { appId } = await getOrPromptProjectAndAppId(options);

      const projectNumber = await needProjectNumber(options);

      let displayName = options.displayName;
      const defaultName = `CLI Debug Token (${os.hostname() || "Unknown Host"})`;
      if (!displayName) {
        if (!options.nonInteractive) {
          displayName = await input({
            message: "What would you like to call this debug token?",
            default: defaultName,
          });
        } else {
          displayName = defaultName;
        }
      }

      const existingTokens = await listDebugTokens(projectNumber, appId);
      const matchingTokens = existingTokens.filter((t) => t.displayName === displayName);

      if (matchingTokens.length > 0) {
        let shouldOverwrite = options.force;
        if (!shouldOverwrite) {
          if (options.nonInteractive) {
            throw new FirebaseError(
              `A token with the display name "${displayName}" already exists. Must pass --force to overwrite in non-interactive mode.`,
              { exit: 1 },
            );
          }
          shouldOverwrite = await confirm({
            message: `A token with the display name "${displayName}" already exists. Delete the old token(s)?`,
            default: true,
          });
        }
        if (shouldOverwrite) {
          for (const t of matchingTokens) {
            await deleteDebugToken(t.name);
          }
        } else {
          throw new FirebaseError("Registration canceled.", { exit: 1 });
        }
      }

      const result = await promiseWithSpinner<DebugToken>(
        async () => await createDebugToken(projectNumber, appId, displayName, token),
        `Registering App Check debug token with Firebase for app ${clc.bold(appId)}`,
      );

      logSuccess(`Successfully registered App Check debug token:
  - Display Name: ${clc.bold(result.displayName)}
  - Token: ${clc.bold(clc.green(token))}
  - Resource Name: ${clc.cyan(result.name)}
  
  ${clc.yellow(clc.bold("Important: ") + "This debug token is a secret and should not be shared.")}
  ${clc.yellow("TODO: Remember to delete this token once your testing has finished.")}`);

      return result;
    },
  );
