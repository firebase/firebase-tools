import { bold } from "cli-color";

import { Command } from "../command";
import { deleteSite } from "../hosting/api";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";

export default new Command("hosting:site:delete <siteName>")
  .description("delete a Firebase Hosting site")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.delete"])
  .action(async (siteName: string, options) => {
    const projectId = getProjectId(options);
    if (!siteName) {
      throw new FirebaseError("siteName is required");
    }

    await deleteSite(projectId, siteName);
    logger.info(`Site ${bold(siteName)} deleted.`);
  });
