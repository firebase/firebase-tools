import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Backup, getBackup } from "../gcp/firestore";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:backups:get <backup>")
  .description("get a Cloud Firestore database backup")
  .before(requirePermissions, ["datastore.backups.get"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupName: string) => {
    const backup: Backup = await getBackup(backupName);
    const printer = new PrettyPrint();

    printer.prettyPrintBackup(backup);

    return backup;
  });
