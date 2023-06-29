const Table = require("cli-table");

import { CustomDomain, listSites, siteCustomDomains } from "../hosting/api";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { requireConfig } from "../requireConfig";
import { datetimeString } from "../utils";
import { Options } from "../options";

const TABLE_HEAD = [
  "Site",
  "Custom Domain",
  "Host State",
  "Ownership State",
  "Created At",
  "Updated At",
];

export const command = new Command("hosting:domains:list")
  .description(
    "list all Firebase Hosting custom domains in a project, optionally filtering to a specific site"
  )
  .option("--site <siteName>", "list custom domains for the specified site")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (options: Options): Promise<{ customDomains: CustomDomain[] }> => {
    const projectId = needProjectId(options);
    const siteId = options.site as string;
    let siteIds: string[] = [siteId];
    if (!siteId) {
      siteIds = [];
      const sites = await listSites(projectId);
      for (const s of sites) {
        const n = s.name.split("/").pop();
        if (!n) {
          continue;
        }
        siteIds.push(n);
      }
    }

    let allCustomDomains: CustomDomain[] = [];

    const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
    for (const site of siteIds) {
      const customDomains = await siteCustomDomains(projectId, site);
      if (!customDomains.length) {
        continue;
      }
      allCustomDomains = allCustomDomains.concat(customDomains);

      for (const d of customDomains) {
        const domainName = d.name.split("/").pop();
        table.push([
          site,
          domainName,
          d.hostState,
          d.ownershipState,
          datetimeString(new Date(d.createTime)),
          datetimeString(new Date(d.updateTime)),
        ]);
      }
    }

    logger.info();
    logger.info(`Custom Domains in project ${projectId}`);
    logger.info();
    logger.info(table.toString());

    return { customDomains: allCustomDomains };
  });
