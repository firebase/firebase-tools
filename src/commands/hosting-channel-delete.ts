import { bold } from "cli-color";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { deleteChannel } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getInstanceId from "../getInstanceId";
import { logLabeledSuccess } from "../utils";

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

      // TODO: implement --force to not prompt (see below).
      if (options.force) {
        throw new FirebaseError("force is not yet implemented");
      }

      // TODO: implement prompting and confirmation.
      await deleteChannel(projectId, siteId, channelId);

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`
      );
    }
  );
