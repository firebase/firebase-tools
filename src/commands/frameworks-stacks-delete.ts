import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as gcp from "../gcp/frameworks";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

export const command = new Command("stacks:delete")
  .description("Delete a stack from a Firebase project")
  .option("-l, --location <location>", "Stack backend location", "us-central1")
  .option("-s, --stackId <stackId>", "Stack backend location", "")
  .withForce()
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const stackId = options.stackId as string;
    if (!stackId) {
      throw new FirebaseError("Stack id can't be empty.");
    }
    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to delete the Stack with id: " + stackId + "\n  Are you sure?",
      },
      options
    );
    if (!confirmDeletion) {
      throw new FirebaseError("Deletion aborted.");
    }

    try {
      await gcp.deleteStack(projectId, location, stackId);
      utils.logSuccess(`Successfully deleted the stack: ${stackId}`);
    } catch (err) {
      throw new FirebaseError(
        `Failed to delete stack: ${stackId}. Please check the parameters you have provided.`
      );
    }
  });
