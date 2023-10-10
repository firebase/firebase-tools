import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as gcp from "../gcp/frameworks";
import { promptOnce } from "../prompt";

export const command = new Command("stacks:delete")
  .description("Delete a stack from a Firebase project")
  .option("-l, --location <location>", "Stack backend location", "us-central1")
  .option("-stack, --stackId <stackId>", "Stack backend location", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const stackId = options.stackId as string;
    if (!stackId) {
      throw new FirebaseError("Stack id can't be empty.");
    }
    if (!location) {
      throw new FirebaseError("Location can't be empty.");
    }
    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to delete the Stack with id:\n" + stackId + "\n  Are you sure?",
      },
      options
    );
    if (!confirmDeletion) {
      throw new FirebaseError("Command aborted.");
    }

    await gcp.deleteStack(projectId, location, stackId);
  });
