import { bold } from "colorette";
import { Command } from "../command.js";
import { Site, listSites } from "../hosting/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";
import Table from "cli-table";

const TABLE_HEAD = ["Site ID", "Default URL", "App ID (if set)"];

export const command = new Command("hosting:sites:list")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(
    async (
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ sites: Site[] }> => {
      const projectId = needProjectId(options);
      const sites = await listSites(projectId);
      const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
      for (const site of sites) {
        const siteId = site.name.split("/").pop();
        table.push([siteId, site.defaultUrl, site.appId || "--"]);
      }

      logger.info();
      logger.info(`Sites for project ${bold(projectId)}`);
      logger.info();
      logger.info(table.toString());

      return { sites };
    },
  );
