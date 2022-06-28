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

import { bold } from "cli-color";
import Table = require("cli-table");

import { Channel, listChannels } from "../hosting/api";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { requireConfig } from "../requireConfig";
import { datetimeString } from "../utils";
import { requireHostingSite } from "../requireHostingSite";

const TABLE_HEAD = ["Channel ID", "Last Release Time", "URL", "Expire Time"];

export const command = new Command("hosting:channel:list")
  .description("list all Firebase Hosting channels for your project")
  .option("--site <siteName>", "list channels for the specified site")
  .before(requireConfig)
  // TODO: `update` permission is maybe a bit aggressive. Bring down to view-ish?
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ channels: Channel[] }> => {
      const projectId = needProjectId(options);
      const siteId = options.site;
      const channels = await listChannels(projectId, siteId);

      const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
      for (const channel of channels) {
        const channelId = channel.name.split("/").pop();
        table.push([
          channelId,
          datetimeString(new Date(channel.updateTime)),
          channel.url,
          channel.expireTime ? datetimeString(new Date(channel.expireTime)) : "never",
        ]);
      }

      logger.info();
      logger.info(`Channels for site ${bold(siteId)}`);
      logger.info();
      logger.info(table.toString());

      return { channels };
    }
  );
