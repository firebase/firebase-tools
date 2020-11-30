import { bold, yellow } from "cli-color";

import { Channel, createChannel, addAuthDomain, normalizeName } from "../hosting/api";
import { Command } from "../command";
import { DEFAULT_DURATION, calculateChannelExpireTTL } from "../hosting/expireUtils";
import { FirebaseError } from "../error";
import { logLabeledSuccess, datetimeString, logLabeledWarning, consoleUrl } from "../utils";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import * as marked from "marked";
import { requireHostingSite } from "../requireHostingSite";

const LOG_TAG = "hosting:channel";

export default new Command("hosting:channel:create [channelId]")
  .description("create a Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h or 30d) for channel expiration, max 30d"
  )
  .option("--site <siteId>", "site for which to create the channel")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Channel> => {
      const projectId = getProjectId(options);
      const site = options.site;

      let expireTTL = DEFAULT_DURATION;
      if (options.expires) {
        expireTTL = calculateChannelExpireTTL(options.expires);
      }

      if (!channelId) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"channelId" argument must be provided in a non-interactive environment`
          );
        }
        channelId = await promptOnce(
          {
            type: "input",
            message: "Please provide a URL-friendly name for the channel:",
            validate: (s) => s.length > 0,
          } // Prevents an empty string from being submitted!
        );
      }
      if (!channelId) {
        throw new FirebaseError(`"channelId" must not be empty`);
      }

      channelId = normalizeName(channelId);

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

      try {
        await addAuthDomain(projectId, channel.url);
      } catch (e) {
        logLabeledWarning(
          LOG_TAG,
          marked(
            `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${consoleUrl(
              projectId,
              "/authentication/providers"
            )}`
          )
        );
        logger.debug("[hosting] unable to add auth domain", e);
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} has been created on site ${bold(site)}.`
      );
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} will expire at ${bold(
          datetimeString(new Date(channel.expireTime))
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
