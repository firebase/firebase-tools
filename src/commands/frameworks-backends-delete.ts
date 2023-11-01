import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as gcp from "../gcp/frameworks";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

export const command = new Command("backends:delete")
  .description("Delete a backend from a Firebase project")
  .option("-l, --location <location>", "App Backend location", "us-central1")
  .option("-s, --backendId <backendId>", "Backend Id", "")
  .withForce()
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const backendId = options.backendId as string;
    if (!backendId) {
      throw new FirebaseError("Backend id can't be empty.");
    }
    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to delete the Backend with id: " + backendId + "\n  Are you sure?",
      },
      options
    );
    if (!confirmDeletion) {
      throw new FirebaseError("Deletion aborted.");
    }

    try {
      await gcp.deleteBackend(projectId, location, backendId);
      utils.logSuccess(`Successfully deleted the backend: ${backendId}`);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to delete backend: ${backendId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }
  });
