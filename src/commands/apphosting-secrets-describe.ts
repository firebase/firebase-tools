import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";
import { requireAuth } from "../requireAuth.js";
import { listSecretVersions } from "../gcp/secretManager.js";
import * as secretManager from "../gcp/secretManager.js";
import { requirePermissions } from "../requirePermissions.js";
import Table from "cli-table";
export const command = new Command("apphosting:secrets:describe <secretName>")
  .description("Get metadata for secret and its versions.")
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.secrets.get"])
  .action(async (secretName: string, options: Options) => {
    const projectId = needProjectId(options);
    const versions = await listSecretVersions(projectId, secretName);

    const table = new Table({
      head: ["Name", "Version", "Status", "Create Time"],
      style: { head: ["yellow"] },
    });
    for (const version of versions) {
      table.push([secretName, version.versionId, version.state, version.createTime]);
    }
    logger.info(table.toString());
    return { secrets: versions };
  });
