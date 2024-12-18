import { bold } from "colorette";
import open from "open";

import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import { getChannel, listChannels, normalizeName } from "../hosting/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { requireConfig } from "../requireConfig.js";
import { logLabeledBullet } from "../utils.js";
import { promptOnce } from "../prompt.js";
import { requireHostingSite } from "../requireHostingSite.js";

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

        let channels = await listChannels(projectId, siteId);
          channels.sort((a, b) => {
            if (a.name < b.name) {
            return -1;
          }
          if (a.name > b.name) {
            return 1;
          }
          return 0;
        });

        channelId = await promptOnce({
          type: "list",
          message: "Which channel would you like to open?",
          choices: channels.map((c) => c.name.split("/").pop() || c.name),
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
