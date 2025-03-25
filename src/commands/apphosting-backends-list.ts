import { Command } from "../command";
import { datetimeString } from "../utils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import * as apphosting from "../gcp/apphosting";
import * as Table from "cli-table3";

const TABLE_HEAD = ["Backend", "Repository", "URL", "Primary Region", "Updated Date"];

export const command = new Command("apphosting:backends:list")
  .description("list Firebase App Hosting backends")
  .before(apphosting.ensureApiEnabled)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    let backendRes: apphosting.ListBackendsResponse;
    try {
      backendRes = await apphosting.listBackends(projectId, /* location= */ "-");
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
