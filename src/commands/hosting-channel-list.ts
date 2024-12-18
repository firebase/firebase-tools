import { bold } from "colorette";
import { Channel, listChannels } from "../hosting/api.js";
import { Command } from "../command.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";
import { requireConfig } from "../requireConfig.js";
import { datetimeString } from "../utils.js";
import { requireHostingSite } from "../requireHostingSite.js";
import Table from "cli-table";

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
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
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
    },
  );
