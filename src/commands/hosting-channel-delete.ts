import { bold, underline } from "colorette";
import { marked } from "marked";

import { Command } from "../command.js";
import { consoleUrl, logLabeledSuccess, logLabeledWarning } from "../utils.js";
import { deleteChannel, normalizeName, getChannel, removeAuthDomain } from "../hosting/api.js";
import { promptOnce } from "../prompt.js";
import { requireHostingSite } from "../requireHostingSite.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { requireConfig } from "../requireConfig.js";
import { logger } from "../logger.js";

export const command = new Command("hosting:channel:delete <channelId>")
  .description("delete a Firebase Hosting channel")
  .withForce()
  .option("--site <siteId>", "site in which the channel exists")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = needProjectId(options);
      const siteId = options.site;

      channelId = normalizeName(channelId);
      const channel = await getChannel(projectId, siteId, channelId);

      const confirmed = await promptOnce(
        {
          name: "force",
          type: "confirm",
          message: `Are you sure you want to delete the Hosting Channel ${underline(
            channelId,
          )} for site ${underline(siteId)}?`,
          default: false,
        },
        options,
      );

      if (!confirmed) {
        return;
      }

      await deleteChannel(projectId, siteId, channelId);
      if (channel) {
        try {
          await removeAuthDomain(projectId, channel.url);
        } catch (e: any) {
          logLabeledWarning(
            "hosting:channel",
            await marked(
              `Unable to remove channel domain from Firebase Auth. Visit the Firebase Console at ${consoleUrl(
                projectId,
                "/authentication/providers",
              )}`,
            ),
          );
          logger.debug("[hosting] unable to remove auth domain", e);
        }
      }

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`,
      );
    },
  );
