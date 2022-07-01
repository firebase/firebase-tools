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

import { last, sortBy } from "lodash";
import { bold } from "cli-color";
import * as open from "open";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { getChannel, listChannels, normalizeName } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { requireConfig } from "../requireConfig";
import { logLabeledBullet } from "../utils";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";

export const command = new Command("hosting:channel:open [channelId]")
  .description("opens the URL for a Firebase Hosting channel")
  .help("if unable to open the URL in a browser, it will be displayed in the output")
  .option("--site <siteId>", "the site to which the channel belongs")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ url: string }> => {
      const projectId = needProjectId(options);
      const siteId = options.site;

      if (!channelId) {
        if (options.nonInteractive) {
          throw new FirebaseError(`Please provide a channelId.`);
        }

        const channels = await listChannels(projectId, siteId);
        sortBy(channels, ["name"]);

        channelId = await promptOnce({
          type: "list",
          message: "Which channel would you like to open?",
          choices: channels.map((c) => last(c.name.split("/")) || c.name),
        });
      }

      channelId = normalizeName(channelId);

      const channel = await getChannel(projectId, siteId, channelId);
      if (!channel) {
        throw new FirebaseError(
          `Could not find the channel ${bold(channelId)} for site ${bold(siteId)}.`
        );
      }

      logLabeledBullet("hosting:channel", channel.url);
      if (!options.nonInteractive) {
        open(channel.url);
      }

      return { url: channel.url };
    }
  );
