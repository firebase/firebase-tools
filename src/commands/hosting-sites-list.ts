import { bold } from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { Site, listSites } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const TABLE_HEAD = ["Site ID", "Default URL", "App ID (if set)"];

export const command = new Command("hosting:sites:list")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(
    async (
      options: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ sites: Site[] }> => {
      const projectId = needProjectId(options);
      let sites: Site[];
      
      try {
        sites = await listSites(projectId);
      } catch (e: any) {
        if (e.status === 409) {
          throw new FirebaseError(
            `Conflict error (409) when listing hosting sites. This may indicate a ghost channel ` +
              `from a previous project deletion. Try:\n` +
              `  1. ${bold("firebase hosting:channel:create live --force")} to recreate the live channel\n` +
              `  2. Contact Firebase support if the issue persists`,
            { original: e },
          );
        }
        throw e;
      }
      
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
