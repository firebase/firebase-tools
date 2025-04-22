import * as clc from "colorette";

import { Command } from "../command";
import { calculateRetention } from "../firestore/backupUtils";
import { BackupSchedule, updateBackupSchedule } from "../gcp/firestore";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

export const command = new Command("firestore:backups:schedules:update <backupSchedule>")
  .description("update a backup schedule under your Cloud Firestore database")
  .option("--retention <duration>", "duration string (e.g. 12h or 30d) for backup retention")
  .before(requirePermissions, ["datastore.backupSchedules.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupScheduleName: string, options: FirestoreOptions) => {
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:backups:schedules:update --help for more info.";

    if (!options.retention) {
      throw new FirebaseError(`Missing required flag --retention. ${helpCommandText}`);
    }
    const retention = calculateRetention(options.retention);

    const backupSchedule: BackupSchedule = await updateBackupSchedule(
      backupScheduleName,
      retention,
    );

    if (options.json) {
      logger.info(JSON.stringify(backupSchedule, undefined, 2));
    } else {
      logger.info(
        clc.bold(`Successfully updated ${printer.prettyBackupScheduleString(backupSchedule)}`),
      );
    }

    return backupSchedule;
  });
