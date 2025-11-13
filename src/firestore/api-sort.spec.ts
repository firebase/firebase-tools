import { expect } from "chai";

import { Backup, BackupSchedule, DayOfWeek } from "../gcp/firestore";
import { durationFromSeconds } from "../gcp/proto";
import * as sort from "./api-sort";

describe("compareApiBackup", () => {
  it("should compare backups by location", () => {
    const nam5Backup: Backup = {
      name: "projects/example/locations/nam5/backups/backupid",
    };
    const usWest1Backup: Backup = {
      name: "projects/example/locations/us-west1/backups/backupid",
    };
    expect(sort.compareApiBackup(usWest1Backup, nam5Backup)).to.greaterThanOrEqual(1);
    expect(sort.compareApiBackup(nam5Backup, usWest1Backup)).to.lessThanOrEqual(-1);
  });

  it("should compare backups by snapshotTime (descending) if location is the same", () => {
    const earlierBackup: Backup = {
      name: "projects/example/locations/nam5/backups/backupid",
      snapshotTime: "2024-01-01T00:00:00.000000Z",
    };
    const laterBackup: Backup = {
      name: "projects/example/locations/nam5/backups/backupid",
      snapshotTime: "2024-02-02T00:00:00.000000Z",
    };
    expect(sort.compareApiBackup(earlierBackup, laterBackup)).to.greaterThanOrEqual(1);
    expect(sort.compareApiBackup(laterBackup, earlierBackup)).to.lessThanOrEqual(-1);
  });

  it("should compare backups by full name if location and snapshotTime are the same", () => {
    const nam5Backup1: Backup = {
      name: "projects/example/locations/nam5/backups/earlier-backupid",
      snapshotTime: "2024-01-01T00:00:00.000000Z",
    };
    const nam5Backup2: Backup = {
      name: "projects/example/locations/nam5/backups/later-backupid",
      snapshotTime: "2024-01-01T00:00:00.000000Z",
    };
    expect(sort.compareApiBackup(nam5Backup2, nam5Backup1)).to.greaterThanOrEqual(1);
    expect(sort.compareApiBackup(nam5Backup1, nam5Backup2)).to.lessThanOrEqual(-1);
  });
});

describe("compareApiBackupSchedule", () => {
  it("daily schedules should precede weekly ones", () => {
    const dailySchedule: BackupSchedule = {
      name: "projects/example/databases/mydatabase/backupSchedules/schedule",
      dailyRecurrence: {},
      retention: durationFromSeconds(60 * 60 * 24),
    };
    const weeklySchedule: BackupSchedule = {
      name: "projects/example/databases/mydatabase/backupSchedules/schedule",
      weeklyRecurrence: {
        day: DayOfWeek.FRIDAY,
      },
      retention: durationFromSeconds(60 * 60 * 24 * 7),
    };
    expect(sort.compareApiBackupSchedule(weeklySchedule, dailySchedule)).to.greaterThanOrEqual(1);
    expect(sort.compareApiBackup(dailySchedule, weeklySchedule)).to.lessThanOrEqual(-1);
  });

  it("should compare schedules with the same recurrence by name", () => {
    const dailySchedule1: BackupSchedule = {
      name: "projects/example/databases/mydatabase/backupSchedules/schedule1",
      dailyRecurrence: {},
      retention: durationFromSeconds(60 * 60 * 24),
    };
    const dailySchedule2: BackupSchedule = {
      name: "projects/example/databases/mydatabase/backupSchedules/schedule2",
      dailyRecurrence: {},
      retention: durationFromSeconds(60 * 60 * 24),
    };
    expect(sort.compareApiBackupSchedule(dailySchedule1, dailySchedule2)).to.lessThanOrEqual(-1);
    expect(sort.compareApiBackup(dailySchedule2, dailySchedule1)).to.greaterThanOrEqual(1);
  });
});
