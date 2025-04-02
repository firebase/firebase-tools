import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { BackupSchedule, listBackupSchedules } from "../gcp/firestore";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:backups:schedules:list")
  .description("list backup schedules under your Cloud Firestore database")
  .option(
    "-d, --database <databaseId>",
    "database whose schedules you wish to list. Defaults to the (default) database",
  )
  .before(requirePermissions, ["datastore.backupSchedules.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const printer = new PrettyPrint();

    const databaseId = options.database ?? "(default)";
    const backupSchedules: BackupSchedule[] = await listBackupSchedules(
      options.project,
      databaseId,
    );

    if (options.json) {
      logger.info(JSON.stringify(backupSchedules, undefined, 2));
    } else {
      printer.prettyPrintBackupSchedules(backupSchedules, databaseId);
    }

    return backupSchedules;
  });
