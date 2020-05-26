import { bold } from "cli-color";
import * as open from "open";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { getChannel } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getInstanceId from "../getInstanceId";
import { logLabeledBullet } from "../utils";

export default new Command("hosting:channel:open [channelId]")
  .description("opens the URL for a Firebase Hosting channel")
  .help("if unable to open the URL in a browser, it will be displayed in the output")
  .option("--site <siteId>", "the site to which the channel belongs")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .before(requireInstance)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ url: string }> => {
      const projectId = getProjectId(options);
      const siteId = options.site || (await getInstanceId(options));

      // TODO: prompt for channelId if none was provided.

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
