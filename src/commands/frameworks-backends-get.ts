import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { ALLOWED_REGIONS } from "../init/features/frameworks/constants";
const Table = require("cli-table");
const COLUMN_LENGTH = 20;
const TABLE_HEAD = [
  "Backend Id",
  "Repository Name",
  "URL",
  "Location",
  "Created Date",
  "Updated Date",
];
export const command = new Command("backends:get")
  .description("Get backend details of a Firebase project")
  .option("-l, --location <location>", "App Backend location", "-")
  .option("-b, --backend <backend>", "Backend Id", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const backendId = options.backend as string;
    if (!backendId) {
      throw new FirebaseError("Backend id can't be empty.");
    }

    let backendsList: gcp.Backend[] = [];
    const table = new Table({
      head: TABLE_HEAD,
      style: { head: ["green"] },
    });
    table.colWidths = COLUMN_LENGTH;
    try {
      if (location != "-") {
        const backendInRegion = await gcp.getBackend(projectId, location, backendId);
        backendsList.push(backendInRegion);
        populateTable(backendInRegion, location, table);
      } else {
        const allBackend = await gcp.listBackends(projectId, location);
        backendsList = allBackend.backends.filter((bkd) => bkd.name.split("/").pop() === backendId);
        backendsList.forEach((bkd) => populateTable(bkd, location, table));
      }

      if (backendsList.length != 0) {
        logger.info(table.toString());
      } else {
        logger.info();
        logger.info(
          `No backends found with the given parameters. Please check the parameters you have provided.`
        );
        logger.info();
      }
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backendsList;
  });

function populateTable(backend: gcp.Backend, location: string, table: any) {
  const entry = [
    backend.name.split("/").pop(),
    backend.codebase.repository?.split("/").pop(),
    backend.uri,
    location,
    backend.createTime,
    backend.updateTime,
  ];
  const newRow = entry.map((name) => {
    const maxCellWidth = COLUMN_LENGTH - 2;
    const chunks = [];
    for (let i = 0; name && i < name.length; i += maxCellWidth) {
      chunks.push(name.substring(i, i + maxCellWidth));
    }
    return chunks.join("\n");
  });
  table.push(newRow);
}
