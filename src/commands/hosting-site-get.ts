import Table = require("cli-table");

import { Command } from "../command";
import { getSite } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import { FirebaseError } from "../error";

export default new Command("hosting:site:get <siteName>")
  .description("print info about a Firebase Hosting site")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (siteName: string, options) => {
    const projectId = getProjectId(options);
    if (!siteName) {
      throw new FirebaseError("<siteName> must be specified");
    }
    const site = await getSite(projectId, siteName);
    const table = new Table();
    table.push(["Name:", site.name.split("/").pop()]);
    table.push(["Default URL:", site.defaultUrl]);
    table.push(["App ID:", site.appId || ""]);
    // table.push(["Labels:", JSON.stringify(site.labels)]);

    logger.info();
    logger.info(table.toString());
  });
