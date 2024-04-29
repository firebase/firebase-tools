import { Client } from "../apiv2";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { Constants } from "./constants";
import { EmulatorRegistry } from "./registry";

export interface ScheduledEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export class ScheduledEmulator implements EmulatorInstance {

  // Client for communicating with the Functions Emulator
  private client?: Client;

  private logger = EmulatorLogger.forEmulator(Emulators.SCHEDULED);

  constructor(private args: ScheduledEmulatorArgs) {
  }


  public start(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Started Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Scheduled", "Stopping Scheduled emulator, this is a noop.");
    return Promise.resolve();
  }

  public connect(): Promise<void> {
    this.logger.logLabeled(
      "DEBUG",
      "Scheduled",
      "Connecting Scheduled emulator, this is a noop.",
    );
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
}
