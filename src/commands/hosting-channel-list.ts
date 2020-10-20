import { bold } from "cli-color";
import Table = require("cli-table");

import { Channel, listChannels } from "../hosting/api";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import { datetimeString } from "../utils";
import { requireHostingSite } from "../requireHostingSite";

const TABLE_HEAD = ["Channel ID", "Last Release Time", "URL", "Expire Time"];

export default new Command("hosting:channel:list")
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
      const projectId = getProjectId(options);
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
