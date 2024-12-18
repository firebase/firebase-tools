import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { FirebaseError, getError } from "../error.js";
import { logWarning } from "../utils.js";
import * as apphosting from "../gcp/apphosting.js";
import { printBackendsTable } from "./apphosting-backends-list.js";

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
