import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as gcp from "../gcp/frameworks";
import isEmpty from "lodash/isEmpty";

export const command = new Command("stacks:delete")
  .description("Delete a stack from a Firebase project")
  .option("-l, --location <location>", "Stack backend location", "us-central1")
  .option("-stack, --stackId <stackId>", "Stack backend location", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const stackId = options.stackId as string;
    if (isEmpty(stackId)) {
      throw new FirebaseError("StackId can't be empty.");
    }
    if (isEmpty(location)) {
      throw new FirebaseError("Location can't be empty.");
    }

    await gcp.deleteStack(projectId, location, stackId);
  });
