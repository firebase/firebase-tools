import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { Backup, getBackup } from "../gcp/firestore";

export const command = new Command("firestore:backups:get <backup>")
  .description("Get a Cloud Firestore database backup.")
  .before(requirePermissions, ["datastore.backups.get"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupName: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const backup: Backup = await getBackup(backupName);

    if (options.json) {
      logger.info(JSON.stringify(backup, undefined, 2));
    } else {
      api.prettyPrintBackup(backup);
    }

    return backup;
  });
