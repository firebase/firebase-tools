import * as Table from "cli-table3";
import { Command } from "../command";
import { Site, getSite } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { ensure } from "../ensureApiEnabled";
import { hostingApiOrigin } from "../api";

export const command = new Command("hosting:sites:get <siteId>")
  .description("print info about a Firebase Hosting site")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .before((options) => ensure(needProjectId(options), hostingApiOrigin(), "hosting", true))
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
