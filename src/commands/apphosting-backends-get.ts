import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { logWarning } from "../utils";
import * as apphosting from "../gcp/apphosting";

const Table = require("cli-table");
const COLUMN_LENGTH = 20;
const TABLE_HEAD = ["Backend Id", "Repository", "Location", "URL", "Created Date", "Updated Date"];
export const command = new Command("apphosting:backends:get <backendId>")
  .description("Get backend details of a Firebase project")
  .option("-l, --location <location>", "App Backend location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let backendsList: apphosting.Backend[] = [];
    const table = new Table({
      head: TABLE_HEAD,
      style: { head: ["green"] },
    });
    table.colWidths = COLUMN_LENGTH;
    try {
      if (location !== "-") {
        const backendInRegion = await apphosting.getBackend(projectId, location, backendId);
        backendsList.push(backendInRegion);
        populateTable(backendInRegion, table);
      } else {
        const resp = await apphosting.listBackends(projectId, "-");
        const allBackends = resp.backends || [];
        backendsList = allBackends.filter((bkd) => bkd.name.split("/").pop() === backendId);
        backendsList.forEach((bkd) => populateTable(bkd, table));
      }
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err },
      );
    }
    if (backendsList.length === 0) {
      logWarning(`Found no backend with id: ${backendId}`);
      return;
    }
    logger.info(table.toString());
    return backendsList[0];
  });

function populateTable(backend: apphosting.Backend, table: any) {
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
