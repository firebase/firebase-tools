import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { listSecretVersions } from "../gcp/secretManager";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import * as Table from "cli-table3";

export const command = new Command("apphosting:secrets:describe <secretName>")
  .description("get metadata for secret and its versions")
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
