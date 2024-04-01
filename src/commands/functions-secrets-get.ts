const Table = require("cli-table");

import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { listSecretVersions } from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import * as secretManager from "../gcp/secretManager";

export const command = new Command("functions:secrets:get <KEY>")
  .description("Get metadata for secret and its versions")
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.secrets.get"])
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    const versions = await listSecretVersions(projectId, key);

    const table = new Table({
      head: ["Version", "State"],
      style: { head: ["yellow"] },
    });
    for (const version of versions) {
      table.push([version.versionId, version.state]);
    }
    logger.info(table.toString());
  });
