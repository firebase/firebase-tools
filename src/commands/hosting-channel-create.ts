import { bold, yellow } from "colorette";

import { Channel, createChannel, addAuthDomains, normalizeName } from "../hosting/api";
import { Command } from "../command";
import { DEFAULT_DURATION, calculateChannelExpireTTL } from "../hosting/expireUtils";
import { FirebaseError } from "../error";
import { logLabeledSuccess, datetimeString, logLabeledWarning, consoleUrl } from "../utils";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { requireConfig } from "../requireConfig";
import { marked } from "marked";
import { requireHostingSite } from "../requireHostingSite";
import { errNoDefaultSite } from "../getDefaultHostingSite";

const LOG_TAG = "hosting:channel";

export const command = new Command("hosting:channel:create [channelId]")
  .description("create a Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h or 30d) for channel expiration, max 30d",
  )
  .option("--site <siteId>", "site for which to create the channel")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(async (options) => {
    try {
      await requireHostingSite(options);
    } catch (err: unknown) {
      if (err === errNoDefaultSite) {
        throw new FirebaseError(
          `Unable to deploy to Hosting as there is no Hosting site. Use ${bold(
            "firebase hosting:sites:create",
          )} to create a site.`,
        );
      }
      throw err;
    }
  })
  .action(
    async (
      channelId: string,
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Channel> => {
      const projectId = needProjectId(options);
      const site = options.site;

      let expireTTL = DEFAULT_DURATION;
      if (options.expires) {
        expireTTL = calculateChannelExpireTTL(options.expires);
      }

      if (channelId) {
        options.channelId = channelId;
      }
      channelId =
        channelId ||
        (await promptOnce({
          type: "input",
          message: "Please provide a URL-friendly name for the channel:",
          validate: (s) => s.length > 0,
        }));

      channelId = normalizeName(channelId);

      let channel: Channel;
      try {
        channel = await createChannel(projectId, site, channelId, expireTTL);
      } catch (e: any) {
        if (e.status === 409) {
          throw new FirebaseError(
            `Channel ${bold(channelId)} already exists on site ${bold(site)}. Deploy to ${bold(
              channelId,
            )} with: ${yellow(`firebase hosting:channel:deploy ${channelId}`)}`,
            { original: e },
          );
        }
        throw e;
      }

      try {
        await addAuthDomains(projectId, [channel.url]);
      } catch (e: any) {
        logLabeledWarning(
          LOG_TAG,
          marked(
            `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${consoleUrl(
              projectId,
              "/authentication/providers",
            )}`,
          ),
        );
        logger.debug("[hosting] unable to add auth domain", e);
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} has been created on site ${bold(site)}.`,
      );
      logLabeledSuccess(
        LOG_TAG,
        `Channel ${bold(channelId)} will expire at ${bold(
          datetimeString(new Date(channel.expireTime)),
        )}.`,
      );
      logLabeledSuccess(LOG_TAG, `Channel URL: ${channel.url}`);
      logger.info();
      logger.info(
        `To deploy to this channel, use ${yellow(`firebase hosting:channel:deploy ${channelId}`)}.`,
      );

      return channel;
    },
  );
