import * as clc from "colorette";

import { Command } from "../command";
import { calculateRetention } from "../firestore/backupUtils";
import {
  BackupSchedule,
  DayOfWeek,
  WeeklyRecurrence,
  createBackupSchedule,
} from "../gcp/firestore";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:backups:schedules:create")
  .description("Create a backup schedule under your Cloud Firestore database.")
  .option(
    "-db, --database <databaseId>",
    "Database under which you want to create a schedule. Defaults to the (default) database",
  )
  .option("-rt, --retention <duration>", "duration string (e.g. 12h or 30d) for backup retention")
  .option("-rc, --recurrence <recurrence>", "Recurrence settings; either DAILY or WEEKLY")
  .option(
    "-dw, --day-of-week <dayOfWeek>",
    "On which day of the week to perform backups; one of MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, or SUNDAY",
  )
  .before(requirePermissions, ["datastore.backupSchedules.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const printer = new PrettyPrint();

    const databaseId = options.database || "(default)";

    if (!options.retention) {
      logger.error(
        "Missing required flag --retention. See firebase firestore:backups:schedules:create --help for more info",
      );
      return;
    }
    const retention = calculateRetention(options.retention);

    if (!options.recurrence) {
      logger.error(
        "Missing required flag --recurrence. See firebase firestore:backups:schedules:create --help for more info",
      );
      return;
    }
    const recurrenceType: types.RecurrenceType = options.recurrence;
    if (
      recurrenceType !== types.RecurrenceType.DAILY &&
      recurrenceType !== types.RecurrenceType.WEEKLY
    ) {
      logger.error(
        "Invalid value for flag --recurrence. See firebase firestore:backups:schedules:create --help for more info",
      );
      return;
    }
    let dailyRecurrence: Record<string, never> | undefined;
    let weeklyRecurrence: WeeklyRecurrence | undefined;
    if (options.recurrence === types.RecurrenceType.DAILY) {
      dailyRecurrence = {};
      if (options.dayOfWeek) {
        logger.error("--day-of-week should not be provided if --recurrence is DAILY");
        return;
      }
    } else if (options.recurrence === types.RecurrenceType.WEEKLY) {
      if (!options.dayOfWeek) {
        logger.error(
          "If --recurrence is WEEKLY, --day-of-week must be provided. See firebase firestore:backups:schedules:create --help for more info",
        );
        return;
      }
      const day: DayOfWeek = options.dayOfWeek;
      weeklyRecurrence = {
        day,
      };
    }

    const backupSchedule: BackupSchedule = await createBackupSchedule(
      options.project,
      databaseId,
      retention,
      dailyRecurrence,
      weeklyRecurrence,
    );

    if (options.json) {
      logger.info(JSON.stringify(backupSchedule, undefined, 2));
    } else {
      logger.info(
        clc.bold(`Successfully created ${printer.prettyBackupScheduleString(backupSchedule)}`),
      );
    }

    return backupSchedule;
  });
