import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";

export const command = new Command("apphosting:backends:get <backendId>")
  .description("get backend details of a Firebase project")
  .option("-l, --location <location>", "app backend location", "-")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let backendsList: apphosting.Backend[] = [];
    try {
      if (location !== "-") {
        const backendInRegion = await apphosting.getBackend(projectId, location, backendId);
        backendsList.push(backendInRegion);
      } else {
        const resp = await apphosting.listBackends(projectId, "-");
        const allBackends = resp.backends || [];
        backendsList = allBackends.filter((bkd) => bkd.name.split("/").pop() === backendId);
      }
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err },
      );
    }
    if (backendsList.length === 0) {
      logWarning(`Found no backend with id: ${backendId}`);
      return;
    }
    printBackendsTable(backendsList);
    return backendsList[0];
  });
