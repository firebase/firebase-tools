import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { bold } from "colorette";
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
export const command = new Command("backends:list")
  .description("List backends of a Firebase project.")
  .option("-l, --location <location>", "App Backend location", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const table = new Table({
      head: TABLE_HEAD,
      style: { head: ["green"] },
    });
    table.colWidths = COLUMN_LENGTH;
    let backendsList: gcp.ListBackendsResponse[] = [];
    try {
      if (!location) {
        for (const region of ALLOWED_REGIONS) {
          const backendsPerRegion = await gcp.listBackends(projectId, region.value);
          backendsList.push(backendsPerRegion);
          populateTable(backendsPerRegion, region.name, table);
        }
      } else {
        const backendsPerRegion = await gcp.listBackends(projectId, location);
        backendsList.push(backendsPerRegion);
        populateTable(backendsPerRegion, location, table);
      }

      logger.info();
      logger.info(`Backends for project ${bold(projectId)}`);
      logger.info();
      logger.info(table.toString());
    } catch (err: any) {
      throw new FirebaseError(
        `Unable to list backends present in project: ${projectId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backendsList;
  });

function populateTable(backendsLists: gcp.ListBackendsResponse, location: string, table: any) {
  for (const backend of backendsLists.backends) {
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
}
