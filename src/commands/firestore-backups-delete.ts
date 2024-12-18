import { Command } from "../command.js";
import { Backup, deleteBackup, getBackup } from "../gcp/firestore.js";
import { promptOnce } from "../prompt.js";
import * as clc from "colorette";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { FirebaseError } from "../error.js";

export const command = new Command("firestore:backups:delete <backup>")
  .description("Delete a backup under your Cloud Firestore database.")
  .option("--force", "Attempt to delete backup without prompting for confirmation.")
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
