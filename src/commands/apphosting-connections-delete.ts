import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import {
  deleteAllDeveloperConnectAppHostingConnection,
  deleteDeveloperConnectAppHostingConnection,
} from "../apphosting";
import { FirebaseError } from "../error";

export const command = new Command("apphosting:connections:delete")
  .description("deletes all connections for the current project")
  .option("-l, --location <location>", "specify the region of the connection")
  .option("-c, --connectionId <connectionId>", "specify the id of connection you want to delete")
  .option("-a, --all", "deletes all apphosting connections for this project", false)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string | null;
    const connectionId = options.connectionId as string | null;
    const deleteAll = options.all as boolean;

    if (!connectionId && deleteAll === false) {
      throw new FirebaseError(
        "To delete a connection a connectionId is required. See `firebase apphosting:backends:delete --help`",
      );
    }

    if (!location) {
      throw new FirebaseError(
        "A location is required. See `firebase apphosting:backends:delete --help`",
      );
    }

    if (connectionId) {
      await deleteDeveloperConnectAppHostingConnection(projectId, location, connectionId);
    } else if (deleteAll) {
      await deleteAllDeveloperConnectAppHostingConnection(projectId, location);
    }
  });
