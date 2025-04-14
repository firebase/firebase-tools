import { Command } from "../command";
import { BackupSchedule, deleteBackupSchedule, getBackupSchedule } from "../gcp/firestore";
import { promptOnce } from "../prompt";
import * as clc from "colorette";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";

export const command = new Command("firestore:backups:schedules:delete <backupSchedule>")
  .description("delete a backup schedule under your Cloud Firestore database")
  .option("--force", "attempt to delete backup schedule without prompting for confirmation")
  .before(requirePermissions, ["datastore.backupSchedules.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupScheduleName: string, options: FirestoreOptions) => {
    const backupSchedule: BackupSchedule = await getBackupSchedule(backupScheduleName);

    if (!options.force) {
      const confirmMessage = `You are about to delete ${backupScheduleName}. Do you wish to continue?`;
      const consent = await promptOnce({
        type: "confirm",
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Delete backup schedule canceled.");
      }
    }

    try {
      await deleteBackupSchedule(backupScheduleName);
    } catch (err: any) {
      throw new FirebaseError(`Failed to delete the backup schedule ${backupScheduleName}`, {
        original: err,
      });
    }

    if (options.json) {
      logger.info(JSON.stringify(backupSchedule, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully deleted ${clc.yellow(backupScheduleName)}`));
    }

    return backupSchedule;
  });
