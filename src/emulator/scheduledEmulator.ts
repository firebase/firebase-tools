import * as later from "@breejs/later";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";

export class ScheduledEmulator implements EmulatorInstance {
  private logger = EmulatorLogger.forEmulator(Emulators.SCHEDULED);

  private timers = new Map<string, later.Timer>();

  public start(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Started Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Stopping Scheduled emulator, clearing jobs.");
    return new Promise((resolve) => {
      this.clearTimers();
      resolve();
    });
  }

  public connect(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Connecting Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);
    if (!functionsEmulator) {
      throw new FirebaseError(
        "Scheduled Emulator is running but Functions emulator is not. This should never happen.",
      );
    }
    return { ...functionsEmulator.getInfo(), name: this.getName() };
  }

  getName(): Emulators {
    return Emulators.SCHEDULED;
  }

  public clearTimers(): void {
    this.timers.forEach((timer) => timer.clear());
    this.timers.clear();
  }

  public createTimer(id: string, schedule: string, callback: () => void): void {
    let scheduleData: later.ScheduleData;
    schedule = schedule.trim();

    const regexForCronPattern = /^(((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,6}$/;
    const isCron = regexForCronPattern.test(schedule);
    if (isCron) {
      // We assume that the schedule is a cron expression
      const hasSeconds = schedule.split(" ").length === 6;
      scheduleData = later.parse.cron(schedule, hasSeconds);
    } else {
      // We assume that the schedule is a text expression
      scheduleData = later.parse.text(schedule);
    }

    if (scheduleData.schedules.length === 0) {
      throw new FirebaseError(
        `Failed to parse ${isCron ? "cron" : "text"} schedule for timer ${id}: ${schedule}`,
      );
    }

    const timer = later.setInterval(callback, scheduleData);
    this.timers.set(id, timer);
  }
}
