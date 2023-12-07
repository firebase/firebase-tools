import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { ensureApiEnabled } from "../gcp/frameworks";

const Table = require("cli-table");
const COLUMN_LENGTH = 20;
const TABLE_HEAD = [
  "Backend Id",
  "Repository Name",
  "Location",
  "URL",
  "Created Date",
  "Updated Date",
];
export const command = new Command("backends:get <backendId>")
  .description("Get backend details of a Firebase project")
  .option("-l, --location <location>", "App Backend location", "-")
  .before(ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let backendsList: gcp.Backend[] = [];
    const table = new Table({
      head: TABLE_HEAD,
      style: { head: ["green"] },
    });
    table.colWidths = COLUMN_LENGTH;
    try {
      if (location !== "-") {
        const backendInRegion = await gcp.getBackend(projectId, location, backendId);
        backendsList.push(backendInRegion);
        populateTable(backendInRegion, table);
      } else {
        const allBackend = await gcp.listBackends(projectId, location);
        backendsList = allBackend.backends.filter((bkd) => bkd.name.split("/").pop() === backendId);
        backendsList.forEach((bkd) => populateTable(bkd, table));
      }

      if (backendsList.length !== 0) {
        logger.info(table.toString());
      } else {
        logger.info();
        logger.info(`There are no backends with id: ${backendId}`);
      }
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backendsList;
  });

function populateTable(backend: gcp.Backend, table: any) {
  const [location, , backendId] = backend.name.split("/").slice(3, 6);
  const entry = [
    backendId,
    backend.codebase.repository?.split("/").pop(),
    location,
    backend.uri,
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
