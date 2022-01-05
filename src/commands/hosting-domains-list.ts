import { bold } from "cli-color";
import Table = require("cli-table");

import { Command } from "../command";
import { Domain, listDomains } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const TABLE_HEAD = ["Site ID", "Domain Name", "Status", "Redirect"];

export default new Command("hosting:domains:list <siteID>")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(
    async (
      siteID: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ domains: Domain[] }> => {
      if (!siteID) {
        throw new FirebaseError("<siteID> must be specified");
      }
      const projectId = needProjectId(options);
      const domains = await listDomains(projectId, siteID);
      const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
      for (const domain of domains) {
        const site = domain.site.split("/").pop();
        table.push([
          site,
          domain.domainName,
          domain.status,
          domain.domainRedirect ? domain.domainRedirect.domainName : "",
        ]);
      }

      logger.info();
      logger.info(`Domains for project ${bold(projectId)} and site ${bold(siteID)}`);
      logger.info();
      logger.info(table.toString());

      return { domains };
    }
  );
