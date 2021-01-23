import { bold } from "cli-color";

import { Command } from "../command";
import { createSite } from "../hosting/api";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";

export default new Command("hosting:site:create <siteName>")
  .description("create a Firebase Hosting site")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .action(async (siteName: string, options) => {
    const projectId = getProjectId(options);
    if (!siteName) {
      throw new FirebaseError("siteName is required");
    }

    const site = await createSite(projectId, siteName);
    logger.info(`Site ${bold(site.name)} created. Default URL: ${site.defaultUrl}`);
  });
