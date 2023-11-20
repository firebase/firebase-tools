import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { BackupSchedule, listBackupSchedules } from "../gcp/firestore";

export const command = new Command("firestore:backups:schedules:list")
  .description("List backup schedules under your Cloud Firestore database.")
  .option(
    "-db, --database <databaseId>",
    "Database whose schedules you wish to list. Defaults to the (default) database.",
  )
  .before(requirePermissions, ["datastore.backupSchedules.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const databaseId = options.database || "(default)";
    const backupSchedules: BackupSchedule[] = await listBackupSchedules(
      options.project,
      databaseId,
    );

    if (options.json) {
      logger.info(JSON.stringify(backupSchedules, undefined, 2));
    } else {
      api.prettyPrintBackupSchedules(backupSchedules, databaseId);
    }

    return backupSchedules;
  });
