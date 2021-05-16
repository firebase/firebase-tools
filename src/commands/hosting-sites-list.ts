import { bold } from "cli-color";
import Table = require("cli-table");

import { Command } from "../command";
import { Site, listSites } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import { logger } from "../logger";

const TABLE_HEAD = ["Site ID", "Default URL", "App ID (if set)"];

export default new Command("hosting:sites:list")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(
    async (
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ sites: Site[] }> => {
      const projectId = getProjectId(options);
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
    }
  );
