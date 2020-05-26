import { bold } from "cli-color";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Channel, createChannel } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getInstanceId from "../getInstanceId";
import { logLabeledSuccess } from "../utils";

const LOG_TAG = "hosting:channel";

export default new Command("hosting:channel:create [channelId]")
  .description("create a Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h, 30d) for channel expiration, max 30d"
  )
  .option("--site <siteId>", "site for which to create the channel")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireInstance)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Channel> => {
      const projectId = getProjectId(options);
      const site = options.site || (await getInstanceId(options));

      // TODO: implement --expires.
      if (options.expires) {
        throw new FirebaseError("expires is not yet implemented");
      }

      const channel = await createChannel(projectId, site, channelId);

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} has been created on site ${bold(site)}.`
      );
      logLabeledSuccess(LOG_TAG, `Channel URL: ${channel.url}`);
      logger.info();
      logger.info(
        `To deploy to this channel, use \`firebase hosting:channel:deploy ${channelId}\`.`
      );

      return channel;
    }
  );
