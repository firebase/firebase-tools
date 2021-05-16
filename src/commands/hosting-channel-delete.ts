import { bold, underline } from "cli-color";
import marked from "marked";

import { Command } from "../command";
import { consoleUrl, logLabeledSuccess, logLabeledWarning } from "../utils";
import { deleteChannel, normalizeName, getChannel, removeAuthDomain } from "../hosting/api";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";
import { logger } from "../logger";

export default new Command("hosting:channel:delete <channelId>")
  .description("delete a Firebase Hosting channel")
  .option("--site <siteId>", "site in which the channel exists")
  .option("-f, --force", "delete without confirmation")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = getProjectId(options);
      const siteId = options.site;

      channelId = normalizeName(channelId);
      const channel = await getChannel(projectId, siteId, channelId);

      const confirmed = await promptOnce(
        {
          name: "force",
          type: "confirm",
          message: `Are you sure you want to delete the Hosting Channel ${underline(
            channelId
          )} for site ${underline(siteId)}?`,
          default: false,
        },
        options
      );

      if (!confirmed) {
        return;
      }

      await deleteChannel(projectId, siteId, channelId);
      if (channel) {
        try {
          await removeAuthDomain(projectId, channel.url);
        } catch (e) {
          logLabeledWarning(
            "hosting:channel",
            marked(
              `Unable to remove channel domain from Firebase Auth. Visit the Firebase Console at ${consoleUrl(
                projectId,
                "/authentication/providers"
              )}`
            )
          );
          logger.debug("[hosting] unable to remove auth domain", e);
        }
      }

      logLabeledSuccess(
        "hosting:channels",
        `Successfully deleted channel ${bold(channelId)} for site ${bold(siteId)}.`
      );
    }
  );
