import { Command } from "../command.js";
import { Site, getSite } from "../hosting/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";
import { FirebaseError } from "../error.js";
import Table from "cli-table";

export const command = new Command("hosting:sites:get <siteId>")
  .description("print info about a Firebase Hosting site")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (siteId: string, options): Promise<Site> => {
    const projectId = needProjectId(options);
    if (!siteId) {
      throw new FirebaseError("<siteId> must be specified");
    }
    const site = await getSite(projectId, siteId);
    const table = new Table();
    table.push(["Site ID:", site.name.split("/").pop()]);
    table.push(["Default URL:", site.defaultUrl]);
    table.push(["App ID:", site.appId || ""]);
    // table.push(["Labels:", JSON.stringify(site.labels)]);

    logger.info();
    logger.info(table.toString());

    return site;
  });
