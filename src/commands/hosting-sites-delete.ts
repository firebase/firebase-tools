import { bold, underline } from "cli-color";

import { Command } from "../command";
import { logLabeledSuccess } from "../utils";
import { getSite, deleteSite } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as requireConfig from "../requireConfig";

const LOG_TAG = "hosting:sites";

export default new Command("hosting:sites:delete <siteId>")
  .description("delete a Firebase Hosting site")
  .option("-f, --force", "delete without confirmation")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.delete"])
  .action(
    async (
      siteId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = getProjectId(options);
      if (!siteId) {
        throw new FirebaseError("siteId is required");
      }

      let confirmed = Boolean(options.force);
      if (!confirmed) {
        confirmed = await promptOnce({
          message: `Are you sure you want to delete the Hosting Site ${underline(
            siteId
          )} for project ${underline(projectId)}?`,
          type: "confirm",
          default: false,
        });
      }
      if (!confirmed) {
        return;
      }

      // Check that the site exists first, to avoid giving a sucessesful message on a non-existant site.
      await getSite(projectId, siteId);
      await deleteSite(projectId, siteId);
      logLabeledSuccess(
        LOG_TAG,
        `Successfully deleted site ${bold(siteId)} for project ${bold(projectId)}`
      );
    }
  );
