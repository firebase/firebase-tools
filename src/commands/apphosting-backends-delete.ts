import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { DEFAULT_REGION } from "../init/features/apphosting/constants";
import * as utils from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a backend from a Firebase project")
  .option("-l, --location <location>", "App Backend location", "")
  .withForce()
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    let location = options.location as string;
    if (!backendId) {
      throw new FirebaseError("Backend id can't be empty.");
    }

    if (!location) {
      const allowedLocations = (await apphosting.listLocations(projectId)).map(
        (loc) => loc.locationId,
      );
      location = await promptOnce({
        name: "region",
        type: "list",
        default: DEFAULT_REGION,
        message: "Please select the region of the backend you'd like to delete:",
        choices: allowedLocations,
      });
    }

    let backend: apphosting.Backend;
    try {
      backend = await apphosting.getBackend(projectId, location, backendId);
    } catch (err: any) {
      throw new FirebaseError(`No backends found with given parameters. Command aborted.`, {
        original: err,
      });
    }

    utils.logWarning("You are about to permanently delete the backend:");
    const backends: apphosting.Backend[] = [backend];
    printBackendsTable(backends);

    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "Are you sure?",
      },
      options,
    );
    if (!confirmDeletion) {
      throw new FirebaseError("Deletion Aborted");
    }

    try {
      await apphosting.deleteBackend(projectId, location, backendId);
      utils.logSuccess(`Successfully deleted the backend: ${backendId}`);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to delete backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err },
      );
    }

    return backend;
  });
