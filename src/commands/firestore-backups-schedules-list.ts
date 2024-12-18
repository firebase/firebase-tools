import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { BackupSchedule, listBackupSchedules } from "../gcp/firestore.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:backups:schedules:list")
  .description("List backup schedules under your Cloud Firestore database.")
  .option(
    "-d, --database <databaseId>",
    "Database whose schedules you wish to list. Defaults to the (default) database.",
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
