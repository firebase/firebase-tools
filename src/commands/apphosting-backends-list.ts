import { Command } from "../command.js";
import { datetimeString } from "../utils.js";
import { FirebaseError } from "../error.js";
import { logger } from "../logger.js";
import { needProjectId } from "../projectUtils.js";
import { Options } from "../options.js";
import * as apphosting from "../gcp/apphosting.js";
import Table from "cli-table";
const TABLE_HEAD = ["Backend", "Repository", "URL", "Location", "Updated Date"];

export const command = new Command("apphosting:backends:list")
  .description("list Firebase App Hosting backends")
  .option("-l, --location <location>", "list backends in the specified location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    let backendRes: apphosting.ListBackendsResponse;
    try {
      backendRes = await apphosting.listBackends(projectId, location);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Unable to list backends present for project: ${projectId}. Please check the parameters you have provided.`,
        { original: err as Error },
      );
    }

    const backends = backendRes.backends ?? [];
    printBackendsTable(backends);

    return backends;
  });

/**
 * Prints a table given a list of backends
 */
export function printBackendsTable(backends: apphosting.Backend[]): void {
  const table = new Table({
    head: TABLE_HEAD,
    style: { head: ["green"] },
  });

  for (const backend of backends) {
    const { location, id } = apphosting.parseBackendName(backend.name);
    table.push([
      id,
      // sample repository value: "projects/<project-name>/locations/us-central1/connections/<connection-id>/repositories/<repository-name>"
      backend.codebase?.repository?.split("/").pop() ?? "",
      backend.uri.startsWith("https:") ? backend.uri : "https://" + backend.uri,
      location,
      datetimeString(new Date(backend.updateTime)),
    ]);
  }
  logger.info(table.toString());
}
