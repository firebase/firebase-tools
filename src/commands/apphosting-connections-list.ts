import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { listDeveloperConnectAppHostingConnections } from "../apphosting";
import { logBullet } from "../utils";
import { FirebaseError } from "../error";

export const command = new Command("apphosting:connections:list")
  .description("lists all dev connect connections for the current project")
  .option("-l, --location <location>", "specify the region of the connection")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string | null;

    if (!location) {
      throw new FirebaseError(
        "A location is requried. See `firebase apphosting:connections:list --help`",
      );
    }

    const connections = await listDeveloperConnectAppHostingConnections(projectId, location);

    for (let i = 0; i < connections.length; i++) {
      const connection = connections[i];
      logBullet(connection.name);
    }
  });
