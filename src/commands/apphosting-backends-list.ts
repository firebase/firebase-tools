import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as apphosting from "../gcp/apphosting";

const Table = require("cli-table");
const COLUMN_LENGTH = 20;
const TABLE_HEAD = ["Backend Id", "Repository", "Location", "URL", "Created Date", "Updated Date"];
export const command = new Command("apphosting:backends:list")
  .description("List backends of a Firebase project.")
  .option("-l, --location <location>", "App Backend location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const table = new Table({
      head: TABLE_HEAD,
      style: { head: ["green"] },
    });
    table.colWidths = COLUMN_LENGTH;
    const backendsList: apphosting.Backend[] = [];
    try {
      const backendsPerRegion = await apphosting.listBackends(projectId, location);
      backendsList.push(...(backendsPerRegion.backends || []));
      populateTable(backendsList, table);
      logger.info(table.toString());
    } catch (err: any) {
      throw new FirebaseError(
        `Unable to list backends present for project: ${projectId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backendsList;
  });

function populateTable(backends: apphosting.Backend[], table: any) {
  for (const backend of backends) {
    const [location, , backendId] = backend.name.split("/").slice(3, 6);
    const entry = [
      backendId,
      backend.codebase?.repository?.split("/").pop(),
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
}
