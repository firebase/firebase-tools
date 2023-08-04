import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import * as gcp from "../gcp/frameworks";
import { Stack } from "../gcp/frameworks";

export const command = new Command("stacks:get")
  .option("-l, --location <location>", "Stack backend location", "us-central1")
  .option("--stack, --stackId <stackId>", "Id for the stack", "")
  .description("list stacks for a project")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const stackId = options.stackId as string;
    const stack: Stack = await gcp.getStack(projectId, location, stackId);

    console.log(stack);
  });
