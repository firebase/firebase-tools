const Table = require("cli-table");

import { Command } from "../command";
import { datetimeString } from "../utils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import * as apphosting from "../gcp/apphosting";

const TABLE_HEAD = ["Backend ID", "Repository", "Location", "URL", "Created Date", "Updated Date"];

export const command = new Command("apphosting:backends:list")
  .description("List backends of a Firebase project.")
  .option("-l, --location <location>", "App Backend location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
    let backendRes: apphosting.ListBackendsResponse;
    try {
      backendRes = await apphosting.listBackends(projectId, location);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Unable to list backends present for project: ${projectId}. Please check the parameters you have provided.`,
        { original: err as Error },
      );
    }

    const backends = backendRes?.backends;
    for (const backend of backends) {
      const [backendLocation, , backendId] = backend.name.split("/").slice(3, 6);
      table.push([
        backendId,
        backend.codebase?.repository?.split("/").pop() ?? "",
        backendLocation,
        backend.uri.startsWith("https:") ? backend.uri : "https://" + backend.uri,
        datetimeString(new Date(backend.createTime)),
        datetimeString(new Date(backend.updateTime)),
      ]);
    }
    logger.info(table.toString());

    return backends;
  });
