import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError, getError } from "../error";
import { logWarning } from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";

export const command = new Command("apphosting:backends:get <backend>")
  .description("print info about a Firebase App Hosting backend")
  .before(apphosting.ensureApiEnabled)
  .action(async (backend: string, options: Options) => {
    const projectId = needProjectId(options);

    let backendsList: apphosting.Backend[] = [];
    try {
      const resp = await apphosting.listBackends(projectId, "-");
      const allBackends = resp.backends || [];
      backendsList = allBackends.filter((bkd) => bkd.name.split("/").pop() === backend);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Failed to get backend: ${backend}. Please check the parameters you have provided.`,
        { original: getError(err) },
      );
    }
    if (backendsList.length === 0) {
      logWarning(`Backend "${backend}" not found`);
      return;
    }
    if (backendsList.length > 1) {
      const regions = backendsList.map((b) => apphosting.parseBackendName(b.name).location);
      logWarning(
        `Detected multiple backends with the same ${backend} ID in regions: ${regions.join(", ")}}. This is not allowed until we can support more locations.\n` +
          `Please delete and recreate any backends that share an ID with another backend. ` +
          `Use apphosting:backends:list to see all backends.\n Returning the following backend:`,
      );
    }
    printBackendsTable(backendsList.slice(0, 1));
    return backendsList[0];
  });
