import Table from "cli-table";

import { Command } from "../command.js";
import { logger } from "../logger.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { listSecretVersions } from "../gcp/secretManager.js";

export const command = new Command("functions:secrets:get <KEY>")
  .description("Get metadata for secret and its versions")
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
