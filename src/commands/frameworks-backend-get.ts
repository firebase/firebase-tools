import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";
const Table = require("cli-table");

export const command = new Command("backends:get")
  .description("Get backend details of a Firebase project")
  .option("-l, --location <location>", "App Backend location", "us-central1")
  .option("--s, --backendId <backendId>", "Backend Id", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const backendId = options.backendId as string;
    if (!backendId) {
      throw new FirebaseError("Backend id can't be empty.");
    }

    let backend;
    try {
      backend = await gcp.getBackend(projectId, location, backendId);
      const table = new Table({
        head: ["Backend Id", "Repository Name", "URL", "Location", "Created Date", "Updated Date"],
        style: { head: ["yellow"] },
      });
      table.push([
        backend.name,
        backend.codebase.repository,
        backend.uri,
        backend.createTime,
        backend.updateTime,
      ]);
      logger.info(table.toString());
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backend;
  });
