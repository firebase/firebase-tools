import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { Backup, getBackup } from "../gcp/firestore.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:backups:get <backup>")
  .description("Get a Cloud Firestore database backup.")
  .before(requirePermissions, ["datastore.backups.get"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupName: string, options: FirestoreOptions) => {
    const backup: Backup = await getBackup(backupName);
    const printer = new PrettyPrint();

    if (options.json) {
      logger.info(JSON.stringify(backup, undefined, 2));
    } else {
      printer.prettyPrintBackup(backup);
    }

    return backup;
  });
