import { Command } from "../command";
import { Backup, deleteBackup, getBackup } from "../gcp/firestore";
import { promptOnce } from "../prompt";
import * as clc from "colorette";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";

export const command = new Command("firestore:backups:delete <backup>")
  .description("delete a backup under your Cloud Firestore database")
  .option("--force", "attempt to delete backup without prompting for confirmation")
  .before(requirePermissions, ["datastore.backups.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupName: string, options: FirestoreOptions) => {
    const backup: Backup = await getBackup(backupName);

    if (!options.force) {
      const confirmMessage = `You are about to delete ${backupName}. Do you wish to continue?`;
      const consent = await promptOnce({
        type: "confirm",
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Delete backup canceled.");
      }
    }

    try {
      await deleteBackup(backupName);
    } catch (err: any) {
      throw new FirebaseError(`Failed to delete the backup ${backupName}`, { original: err });
    }

    if (options.json) {
      logger.info(JSON.stringify(backup, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully deleted ${clc.yellow(backupName)}`));
    }

    return backup;
  });
