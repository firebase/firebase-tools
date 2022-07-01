/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { bold, yellow } from "cli-color";

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import { requireHostingSite } from "../requireHostingSite";

const LOG_TAG = "hosting:channel";

export const command = new Command("hosting:channel:create [channelId]")
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
              channelId
            )} with: ${yellow(`firebase hosting:channel:deploy ${channelId}`)}`,
            { original: e }
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
        `To deploy to this channel, use ${yellow(`firebase hosting:channel:deploy ${channelId}`)}.`
      );

      return channel;
    }
  );
