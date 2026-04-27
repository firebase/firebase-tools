import { Command } from "../command";
import { datetimeString } from "../utils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { Options } from "../options";
import * as apphosting from "../gcp/apphosting";
import { isEnabled } from "../experiments";
import * as Table from "cli-table3";

export const command = new Command("apphosting:backends:list")
  .description("list Firebase App Hosting backends")
  .before(requireAuth)
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
  const abiuEnabled = isEnabled("abiu");
  const head = ["Backend", "Repository", "URL", "Primary Region"];
  if (abiuEnabled) {
    head.push("ABIU");
    head.push("Runtime");
  }
  head.push("Updated Date");

  const table = new Table({
    head: head,
    style: { head: ["green"] },
  });

  for (const backend of backends) {
    const { location, id } = apphosting.parseBackendName(backend.name);
    const row = [
      id,
      // sample repository value: "projects/<project-name>/locations/us-central1/connections/<connection-id>/repositories/<repository-name>"
      backend.codebase?.repository?.split("/").pop() ?? "",
      backend.uri.startsWith("https:") ? backend.uri : "https://" + backend.uri,
      location,
    ];
    if (abiuEnabled) {
      let abiuStatus = "N/A";
      const runtimeValue = backend.runtime?.value ?? "";
      // We know these runtimes do not support ABIU
      if (runtimeValue === "" || runtimeValue === "nodejs") {
        abiuStatus = "Disabled";
      } else {
        abiuStatus = backend.automaticBaseImageUpdatesDisabled ? "Disabled" : "Enabled";
      }
      row.push(abiuStatus);
      row.push(backend.runtime?.value ?? "N/A");
    }
    row.push(datetimeString(new Date(backend.updateTime)));
    table.push(row);
  }
  logger.info(table.toString());
}
