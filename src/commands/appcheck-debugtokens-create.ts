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
import { getProjectId, needProjectNumber } from "../projectUtils";
import { createDebugToken, listDebugTokens, deleteDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promiseWithSpinner, logSuccess } from "../utils";
import { Options } from "../options";
import { AppMetadata, AppPlatform, listFirebaseApps } from "../management/apps";
import { getOrPromptProject } from "../management/projects";
import { FirebaseError } from "../error";
import { detectApps } from "../appUtils";
import { select, confirm, input } from "../prompt";

interface AppCheckDebugOptions extends Options {
  app?: string;
  displayName?: string;
}

export const command = new Command("appcheck:debugtokens:create [debugToken]")
  .description("generate and register an App Check debug token for an app")
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--display-name <displayName>", "display name for the debug token")
  .option("--force", "overwrite existing debug token if it has the same display name without prompting")
  .before(requireAuth)
  .action(
    async (
      debugToken: string | undefined,
      options: AppCheckDebugOptions,
    ): Promise<DebugToken | void> => {
      const projectDir = options.cwd || process.cwd();
      const token = debugToken || randomUUID();

      let projectId = getProjectId(options);

      if (!projectId) {
        if (options.nonInteractive) {
          throw new FirebaseError("Must supply project id in non-interactive mode.");
        }
        const result = await getOrPromptProject(options);
        projectId = result.projectId;
        options.project = projectId;
      }
      logger.info(`Active Project: ${clc.bold(projectId)}`);

      let appId = options.app;
      if (!appId) {
        let apps = await listFirebaseApps(projectId, AppPlatform.ANY);
        if (!apps.length) {
          throw new FirebaseError(`There are no apps associated with project ${projectId}.`);
        }

        const localApps = await detectApps(projectDir);
        const localAppIds = localApps.map((a) => a.appId).filter(Boolean) as string[];
        if (localAppIds.length > 0) {
          const filteredApps = apps.filter((app) => localAppIds.includes(app.appId));
          if (filteredApps.length > 0) {
            apps = filteredApps;
          }
        }

        if (apps.length === 1) {
          appId = apps[0].appId;
        } else if (options.nonInteractive) {
          throw new FirebaseError(
            `Project ${projectId} has multiple apps, must specify an app id.`,
          );
        } else {
          const choices = apps.map(
            (app: AppMetadata & { bundleId?: string; packageName?: string }) => {
              return {
                name:
                  `${app.displayName || app.bundleId || app.packageName || "Unknown App"}` +
                  ` - ${app.appId} (${app.platform})`,
                value: app,
              };
            },
          );

          const selectedApp = await select<AppMetadata>({
            message: "Select the app to register a debug token for:",
            choices,
          });
          appId = selectedApp.appId;
        }
      }

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
              { exit: 1 }
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
      - Resource Name: ${clc.cyan(result.name)}`);

      return result;
    },
  );
