import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { Backup, listBackups, ListBackupsResponse } from "../gcp/firestore.js";
import { logWarning } from "../utils.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:backups:list")
  .description("List all Cloud Firestore backups in a given location")
  .option(
    "-l, --location <locationId>",
    "Location to search for backups, for example 'nam5'. Run 'firebase firestore:locations' to get a list of eligible locations. Defaults to all locations.",
  )
  .before(requirePermissions, ["datastore.backups.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const printer = new PrettyPrint();

    const location = options.location ?? "-";
    const listBackupsResponse: ListBackupsResponse = await listBackups(options.project, location);
    const backups: Backup[] = listBackupsResponse.backups || [];

    if (options.json) {
      logger.info(JSON.stringify(listBackupsResponse, undefined, 2));
    } else {
      printer.prettyPrintBackups(backups);
      if (listBackupsResponse.unreachable && listBackupsResponse.unreachable.length > 0) {
        logWarning(
          "We were not able to reach the following locations: " +
            listBackupsResponse.unreachable.join(", "),
        );
      }
    }

    return backups;
  });
