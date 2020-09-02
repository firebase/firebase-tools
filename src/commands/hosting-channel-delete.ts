import { bold, underline } from "cli-color";

import { Command } from "../command";
import { deleteChannel } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getInstanceId from "../getInstanceId";
import { logLabeledSuccess } from "../utils";
import { promptOnce } from "../prompt";

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
  .before(requireInstance)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = getProjectId(options);
      const siteId = options.site || (await getInstanceId(options));

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

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`
      );
    }
  );
