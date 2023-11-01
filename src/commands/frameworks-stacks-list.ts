import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { bold } from "colorette";
const Table = require("cli-table");

export const command = new Command("backends:list")
  .description("List backends of a Firebase project.")
  .option("-l, --location <location>", "App Backend location", "us-central1")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const table = new Table({
      head: ["Backend Id", "Repository Name", "URL", "Location", "Created Date", "Updated Date"],
      style: { head: ["yellow"] },
    });

    let backendsList;
    try {
      backendsList = await gcp.listBackend(projectId, location);
      for (const backend of backendsList.backends) {
        const entry = [
          backend.name,
          backend.codebase.repository,
          backend.uri,
          backend.createTime,
          backend.updateTime,
        ];
        table.push(entry);
      }
      logger.info(`Backends for project ${bold(projectId)}`);
      logger.info(table.toString());
    } catch (err: any) {
      throw new FirebaseError(
        `Unable to list backends present in project: ${projectId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backendsList;
  });
