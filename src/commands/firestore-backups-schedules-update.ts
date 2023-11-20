import { Command } from "../command";
import { calculateRetention } from "../firestore/backupUtils";
import { BackupSchedule, updateBackupSchedule } from "../gcp/firestore";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:backups:schedules:update <backupSchedule>")
  .description("Update a backup schedule under your Cloud Firestore database.")
  .option("-rt, --retention <duration>", "duration string (e.g. 12h or 30d) for backup retention")
  .before(requirePermissions, ["datastore.backupSchedules.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (backupScheduleName: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.retention) {
      logger.error(
        "Missing required flag --retention. See firebase firestore:backups:schedules:update --help for more info",
      );
      return;
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
        clc.bold(`Successfully updated ${api.prettyBackupScheduleString(backupSchedule)}`),
      );
    }

    return backupSchedule;
  });
