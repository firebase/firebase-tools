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
import { FirebaseError } from "../error";

export const command = new Command("firestore:backups:schedules:create")
  .description("create a backup schedule under your Cloud Firestore database")
  .option(
    "-d, --database <databaseId>",
    "database under which you want to create a schedule. Defaults to the (default) database",
  )
  .option("--retention <duration>", "duration string (e.g. 12h or 30d) for backup retention")
  .option("--recurrence <recurrence>", "recurrence settings; either DAILY or WEEKLY")
  .option(
    "--day-of-week <dayOfWeek>",
    "on which day of the week to perform backups; one of MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, or SUNDAY",
  )
  .before(requirePermissions, ["datastore.backupSchedules.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:backups:schedules:create --help for more info.";

    const databaseId = options.database || "(default)";

    if (!options.retention) {
      throw new FirebaseError(`Missing required flag --retention. ${helpCommandText}`);
    }
    const retention = calculateRetention(options.retention);

    if (!options.recurrence) {
      throw new FirebaseError(`Missing required flag --recurrence. ${helpCommandText}`);
    }
    const recurrenceType: types.RecurrenceType = options.recurrence;
    if (
      recurrenceType !== types.RecurrenceType.DAILY &&
      recurrenceType !== types.RecurrenceType.WEEKLY
    ) {
      throw new FirebaseError(`Invalid value for flag --recurrence. ${helpCommandText}`);
    }
    let dailyRecurrence: Record<string, never> | undefined;
    let weeklyRecurrence: WeeklyRecurrence | undefined;
    if (options.recurrence === types.RecurrenceType.DAILY) {
      dailyRecurrence = {};
      if (options.dayOfWeek) {
        throw new FirebaseError(
          `--day-of-week should not be provided if --recurrence is DAILY. ${helpCommandText}`,
        );
      }
    } else if (options.recurrence === types.RecurrenceType.WEEKLY) {
      if (!options.dayOfWeek) {
        throw new FirebaseError(
          `If --recurrence is WEEKLY, --day-of-week must be provided. ${helpCommandText}`,
        );
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
