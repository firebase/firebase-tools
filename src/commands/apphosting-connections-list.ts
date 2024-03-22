import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { listDeveloperConnectConnections } from "../init/features/apphosting";

export const command = new Command("apphosting:connections:list")
  .description("lists all dev connect connections for the current project")
  .option("-l, --location <location>", "specify the region of the connection", "")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    await listDeveloperConnectConnections(projectId, "us-central1");
  });
