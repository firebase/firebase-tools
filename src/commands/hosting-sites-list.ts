import { bold, green, red } from "colorette";
import Table = require("cli-table");

import { Command } from "../command";
import { Site, listSites, SiteConfig, getSiteConfig } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { last } from "../utils";
import { Options } from "../options";

const TABLE_HEAD = [
  "Site ID",
  "Default URL",
  "App ID (if set)",
  "Logging Enabled",
  "Maximum Retained Versions",
];

export const command = new Command("hosting:sites:list")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (options: Options): Promise<{ sites: Site[] }> => {
    const projectId = needProjectId(options);
    const sites = await listSites(projectId);
    const sitesWithConfig: Array<Site & SiteConfig> = [];
    await Promise.all(
      sites.map(async (site) => {
        const config = await getSiteConfig(projectId, last(site.name.split("/")));
        sitesWithConfig.push({ ...site, ...config });
      })
    );
    const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
    sitesWithConfig.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const site of sitesWithConfig) {
      const siteId = site.name.split("/").pop();
      table.push([
        siteId,
        site.defaultUrl,
        site.appId || "--",
        site.cloudLoggingEnabled ? green("Yes") : red("No"),
        `${typeof site.maxVersions === "number" ? site.maxVersions : "infinite"}`,
      ]);
    }

    logger.info();
    logger.info(`Sites for project ${bold(projectId)}`);
    logger.info();
    logger.info(table.toString());

    return { sites };
  });
