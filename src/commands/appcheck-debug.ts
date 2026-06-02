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
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { createDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner, logSuccess, updateOrCreateGitignore } from "../utils";
import { Options } from "../options";

interface AppCheckDebugOptions extends Options {
  displayName?: string;
}

export const command = new Command("appcheck:debug <appId> [debugToken]")
  .description("generate, register, and locally store an App Check debug token for an app")
  .option("--display-name <displayName>", "display name for the debug token")
  .before(requireAuth)
  .action(
    async (
      appId: string,
      debugToken: string | undefined,
      options: AppCheckDebugOptions,
    ): Promise<DebugToken> => {
      const projectNumber = await needProjectNumber(options);
      let displayName = options.displayName;
      if (!displayName) {
        const hostname = os.hostname() || "Unknown Host";
        displayName = `CLI Debug Token (${hostname})`;
      }

      const token = debugToken || uuidv4();

      // 1. Register the debug token with Firebase App Check backend
      const result = await promiseWithSpinner<DebugToken>(
        async () => await createDebugToken(projectNumber, appId, displayName!, token),
        `Registering App Check debug token with Firebase for app ${clc.bold(appId)}`,
      );

      // 2. Write the debug token securely to the local .firebase-debug-token file
      const projectDir = options.cwd || process.cwd();
      const tokenFilePath = path.join(projectDir, ".firebase-debug-token");
      fs.writeFileSync(tokenFilePath, token, { mode: 0o600 }); // Read/write by owner only

      // 3. Automatically update .gitignore to ensure it's never committed to source control
      updateOrCreateGitignore(projectDir, [".firebase-debug-token"]);

      logSuccess(`Successfully registered and stored App Check debug token:
      - Display Name: ${clc.bold(result.displayName)}
      - Token (Saved to .firebase-debug-token): ${clc.bold(clc.green(token))}
      - Resource Name: ${clc.cyan(result.name)}
      - Added '.firebase-debug-token' to your local .gitignore file.`);

      return result;
    },
  );
