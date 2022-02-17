import Table = require("cli-table");

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { listSecretVersions } from "../gcp/secretManager";

export default new Command("functions:secrets:get <KEY>")
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
