import Table = require("cli-table");

import { Command } from "../command";
import { Domain, getDomain } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

export default new Command("hosting:domains:get <siteId> <domainName>")
  .description("print info about a Firebase Hosting domain")
  .before(requirePermissions, ["firebase.domains.list"])
  .action(
    async (siteId: string, domainName: string, options): Promise<Domain> => {
      const projectId = needProjectId(options);
      if (!siteId) {
        throw new FirebaseError("<siteId> must be specified");
      }
      if (!domainName) {
        throw new FirebaseError("<domainName> must be specified");
      }
      const domain = await getDomain(projectId, siteId, domainName);
      const table = new Table();
      table.push(["Site ID:", domain.site.split("/").pop()]);
      table.push(["Domain Name:", domain.domainName.split("/").pop()]);
      table.push(["Status:", domain.status]);
      table.push(["Redirect:", domain.domainRedirect ? domain.domainRedirect.domainName : ""]);
      table.push(["SSL Status:", domain.provisioning ? domain.provisioning.certStatus : ""]);
      table.push(["DNS Status:", domain.provisioning ? domain.provisioning.dnsStatus || "" : ""]);
      table.push([
        "Expected IPs:",
        domain.provisioning ? domain.provisioning.expectedIps || "" : "",
      ]);
      table.push([
        "Discovered IPs:",
        domain.provisioning ? domain.provisioning.discoveredIps || "" : "",
      ]);
      table.push([
        "Last Check Time:",
        domain.provisioning ? domain.provisioning.dnsFetchTime || "" : "",
      ]);

      logger.info();
      logger.info(table.toString());

      return domain;
    }
  );
