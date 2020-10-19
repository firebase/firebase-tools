import { bold, underline } from "cli-color";

import { Command } from "../command";
import { deleteChannel, normalizeName, getChannel, removeAuthDomain } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";
import { logLabeledSuccess } from "../utils";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";

interface ChannelInfo {
  target: string | null;
  site: string;
  url: string;
  expireTime: string;
}

export default new Command("hosting:channel:delete <channelId>")
  .description("delete a Firebase Hosting channel")
  .option("--site <siteId>", "site in which the channel exists")
  .option("-f, --force", "delete without confirmation")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = getProjectId(options);
      const siteId = options.site;

      channelId = normalizeName(channelId);
      const channel = await getChannel(projectId, siteId, channelId);

      let confirmed = Boolean(options.force);
      if (!confirmed) {
        confirmed = await promptOnce({
          message: `Are you sure you want to delete the Hosting Channel ${underline(
            channelId
          )} for site ${underline(siteId)}?`,
          type: "confirm",
          default: false,
        });
      }

      if (!confirmed) {
        return;
      }

      await deleteChannel(projectId, siteId, channelId);
      if (channel) {
        await removeAuthDomain(projectId, channel.url);
      }

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`
      );
    }
  );
