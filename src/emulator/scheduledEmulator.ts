import * as later from "@breejs/later";
import { Client } from "../apiv2";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { Constants } from "./constants";
import { EmulatorRegistry } from "./registry";
import { Timer } from "../deploy/functions/release/timer";
import http from "http";

export interface ScheduledEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export class ScheduledEmulator implements EmulatorInstance {
  // Client for communicating with the Functions Emulator
  private client?: Client;

  private logger = EmulatorLogger.forEmulator(Emulators.SCHEDULED);

  private timers: Map<string, later.Timer> = new Map<string, later.Timer>();

  constructor(private args: ScheduledEmulatorArgs) {}

  public start(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Started Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Stopping Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  public connect(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Connecting Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.SCHEDULED);

    return {
      name: this.getName(),
      host,
      port,
    };
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

    const regexForCronPattern = /(((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,6}/;
    console.log("isCron", regexForCronPattern.test(schedule.trim()));
    if (regexForCronPattern.test(schedule)) {
      // We assume that the schedule is a cron expression
      const hasSeconds = schedule.split(" ").length === 6;
      scheduleData = later.parse.cron(schedule, hasSeconds);
    } else {
      // We assume that the schedule is a text expression
      scheduleData = later.parse.text(schedule);
    }

    console.log({ schedule });
    const timer = later.setInterval(callback, scheduleData);
    this.timers.set(id, timer);
  }
}
