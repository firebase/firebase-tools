/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { bold, underline } from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");

import { Command } from "../command";
import { consoleUrl, logLabeledSuccess, logLabeledWarning } from "../utils";
import { deleteChannel, normalizeName, getChannel, removeAuthDomain } from "../hosting/api";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";

export const command = new Command("hosting:channel:delete <channelId>")
  .description("delete a Firebase Hosting channel")
  .withForce()
  .option("--site <siteId>", "site in which the channel exists")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = needProjectId(options);
      const siteId = options.site;

      channelId = normalizeName(channelId);
      const channel = await getChannel(projectId, siteId, channelId);

      const confirmed = await promptOnce(
        {
          name: "force",
          type: "confirm",
          message: `Are you sure you want to delete the Hosting Channel ${underline(
            channelId
          )} for site ${underline(siteId)}?`,
          default: false,
        },
        options
      );

      if (!confirmed) {
        return;
      }

      await deleteChannel(projectId, siteId, channelId);
      if (channel) {
        try {
          await removeAuthDomain(projectId, channel.url);
        } catch (e: any) {
          logLabeledWarning(
            "hosting:channel",
            marked(
              `Unable to remove channel domain from Firebase Auth. Visit the Firebase Console at ${consoleUrl(
                projectId,
                "/authentication/providers"
              )}`
            )
          );
          logger.debug("[hosting] unable to remove auth domain", e);
        }
      }

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`
      );
    }
  );
