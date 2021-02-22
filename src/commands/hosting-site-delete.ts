import { bold, underline } from "cli-color";

import { Command } from "../command";
import { logLabeledSuccess } from "../utils";
import { getSite, deleteSite } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";

const LOG_TAG = "hosting:site";

export default new Command("hosting:site:delete <siteName>")
  .description("delete a Firebase Hosting site")
  .option("-f, --force", "delete without confirmation")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.delete"])
  .action(async (siteName: string, options) => {
    const projectId = getProjectId(options);
    if (!siteName) {
      throw new FirebaseError("siteName is required");
    }

    let confirmed = Boolean(options.force);
    if (!confirmed) {
      confirmed = await promptOnce({
        message: `Are you sure you want to delete the Hosting Site ${underline(
          siteName
        )} for project ${underline(projectId)}?`,
        type: "confirm",
        default: false,
      });
    }
    if (!confirmed) {
      return;
    }

    // Check that the site exists first, to avoid giving a sucessesful message on a non-existant site.
    await getSite(projectId, siteName);
    await deleteSite(projectId, siteName);
    logLabeledSuccess(
      LOG_TAG,
      `Successfully deleted site ${bold(siteName)} for project ${bold(projectId)}`
    );
  });
