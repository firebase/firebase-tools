import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { resetDeveloperConnectConnections } from "../init/features/apphosting";

export const command = new Command("apphosting:connections:reset")
  .description("deletes all connections for the current project")
  .option("-l, --location <location>", "specify the region of the connection", "")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    await resetDeveloperConnectConnections(projectId, "us-central1");
  });
