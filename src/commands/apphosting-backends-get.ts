import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError, getError } from "../error";
import { logWarning } from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";

export const command = new Command("apphosting:backends:get <backend>")
  .description("print info about a Firebase App Hosting backend")
  .option("-l, --location <location>", "backend location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (backend: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let backendsList: apphosting.Backend[] = [];
    try {
      if (location !== "-") {
        const backendInRegion = await apphosting.getBackend(projectId, location, backend);
        backendsList.push(backendInRegion);
      } else {
        const resp = await apphosting.listBackends(projectId, "-");
        const allBackends = resp.backends || [];
        backendsList = allBackends.filter((bkd) => bkd.name.split("/").pop() === backend);
      }
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
    printBackendsTable(backendsList);
    return backendsList[0];
  });
