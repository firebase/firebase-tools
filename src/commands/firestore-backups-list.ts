import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { Backup, listBackups, ListBackupsResponse } from "../gcp/firestore";
import { logWarning } from "../utils";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:backups:list")
  .description("list all Cloud Firestore backups in a given location")
  .option(
    "-l, --location <locationId>",
    "location to search for backups, for example 'nam5'. Run 'firebase firestore:locations' to get a list of eligible locations. Defaults to all locations",
  )
  .before(requirePermissions, ["datastore.backups.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const printer = new PrettyPrint();

    const location = options.location ?? "-";
    const listBackupsResponse: ListBackupsResponse = await listBackups(options.project, location);
    const backups: Backup[] = listBackupsResponse.backups || [];

    printer.prettyPrintBackups(backups);
    if (listBackupsResponse.unreachable && listBackupsResponse.unreachable.length > 0) {
      logWarning(
        "We were not able to reach the following locations: " +
          listBackupsResponse.unreachable.join(", "),
      );
    }

    // TODO: Consider returning listBackupResponse instead for --json. This will
    // be a breaking change but exposes .unreachable, not just .backups.
    return backups;
  });
