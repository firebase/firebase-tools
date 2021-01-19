import { Command } from "../command";
import { listSites } from "../hosting/api";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";

export default new Command("hosting:site:list")
.description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (options) => {
    const sites = await listSites(getProjectId(options));
    console.error(sites);
  });
