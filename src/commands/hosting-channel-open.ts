import { last, sortBy } from "lodash";
import { bold } from "colorette";
import * as open from "open";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { getChannel, listChannels, normalizeName } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { requireConfig } from "../requireConfig";
import { logLabeledBullet } from "../utils";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";

export const command = new Command("hosting:channel:open [channelId]")
  .description("opens the URL for a Firebase Hosting channel")
  .help("if unable to open the URL in a browser, it will be displayed in the output")
  .option("--site <siteId>", "the site to which the channel belongs")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ url: string }> => {
      const projectId = needProjectId(options);
      const siteId = options.site;

      if (!channelId) {
        if (options.nonInteractive) {
          throw new FirebaseError(`Please provide a channelId.`);
        }

        const channels = await listChannels(projectId, siteId);
        sortBy(channels, ["name"]);

        channelId = await promptOnce({
          type: "list",
          message: "Which channel would you like to open?",
          choices: channels.map((c) => last(c.name.split("/")) || c.name),
        });
      }

      channelId = normalizeName(channelId);

      const channel = await getChannel(projectId, siteId, channelId);
      if (!channel) {
        throw new FirebaseError(
          `Could not find the channel ${bold(channelId)} for site ${bold(siteId)}.`,
        );
      }

      logLabeledBullet("hosting:channel", channel.url);
      if (!options.nonInteractive) {
        open(channel.url);
      }

      return { url: channel.url };
    },
  );
