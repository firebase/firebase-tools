import { bold, yellow } from "cli-color";

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
import { promptOnce } from "../prompt";

const LOG_TAG = "hosting:channel";

const DURATION_REGEX = /^([0-9]+)(h|d|m)$/;
enum Duration {
  MINUTE = 60 * 1000,
  HOUR = 60 * 60 * 1000,
  DAY = 24 * 60 * 60 * 1000,
}
const DURATIONS: { [d: string]: Duration } = {
  m: Duration.MINUTE,
  h: Duration.HOUR,
  d: Duration.DAY,
};
const DEFAULT_DURATION = 7 * Duration.DAY;
const MAX_DURATION = 30 * Duration.DAY;

/*
 * calculateExpireTTL returns the ms duration of the provided flag.
 */
function calculateExpireTTL(flag?: string): number {
  const match = DURATION_REGEX.exec(flag || "");
  if (!match) {
    throw new FirebaseError(
      `"expires" flag must be a duration string (e.g. 24h or 7d) at most 30d`
    );
  }
  let d = 0;
  try {
    d = parseInt(match[1], 10) * DURATIONS[match[2]];
  } catch (e) {
    throw new FirebaseError(`Failed to parse provided expire time "${flag}": ${e}`);
  }
  if (d > MAX_DURATION) {
    throw new FirebaseError(`"expires" flag may not be longer than 30d`);
  }
  return d;
}

export default new Command("hosting:channel:create [channelId]")
  .description("create a Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h or 30d) for channel expiration, max 30d"
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

      let expireTTL = DEFAULT_DURATION;
      if (options.expires) {
        expireTTL = calculateExpireTTL(options.expires);
      }

      if (!channelId) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"channelId" argument must be provided in a non-interactive environment`
          );
        }
        channelId = await promptOnce({
          type: "input",
          message: "Please provide a URL-friendly name for the channel:",
          validate: (s) => s, // Prevents an empty string from being submitted!
        });
      }
      if (!channelId) {
        throw new FirebaseError(`"channelId" must not be empty`);
      }

      let channel: Channel;
      try {
        channel = await createChannel(projectId, site, channelId, expireTTL);
      } catch (e) {
        if (e.status == 409) {
          throw new FirebaseError(
            `Channel ${bold(channelId)} already exists on site ${bold(site)}. Deploy to ${bold(
              channelId
            )} with: ${yellow(`firebase hosting:channel:deploy ${channelId}`)}`,
            { original: e }
          );
        }
        throw e;
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} has been created on site ${bold(site)}.`
      );
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} will expire at ${bold(
          new Date(channel.expireTime).toLocaleString()
        )}.`
      );
      logLabeledSuccess(LOG_TAG, `Channel URL: ${channel.url}`);
      logger.info();
      logger.info(
        `To deploy to this channel, use \`firebase hosting:channel:deploy ${channelId}\`.`
      );

      return channel;
    }
  );
