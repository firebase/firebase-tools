import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import * as utils from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";
import { deleteBackendAndPoll, promptLocation } from "../apphosting";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a Firebase App Hosting backend")
  .option("-l, --location <location>", "specify the location of the backend", "")
  .withForce()
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    let location = options.location as string;

    location =
      location ||
      (await promptLocation(
        projectId,
        "Please select the location of the backend you'd like to delete:",
      ));

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
      await deleteBackendAndPoll(projectId, location, backendId);
      utils.logSuccess(`Successfully deleted the backend: ${backendId}`);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to delete backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err },
      );
    }

    return backend;
  });
