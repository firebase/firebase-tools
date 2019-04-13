/* tslint:disable:no-console */
import { ChildProcess } from "child_process";

export const enum Emulators {
  FUNCTIONS = "functions",
  FIRESTORE = "firestore",
  DATABASE = "database",
  HOSTING = "hosting",
}

export interface EmulatorInstance {
  start(): Promise<void>; // Called to begin emulator process
  connect(): Promise<void>; // Called once all sibling emulators are start()'d
  stop(): Promise<void>; // Called to kill emulator process
}

export interface EmulatorInfo {
  instance: EmulatorInstance;
  host: string;
  port: number;
}

export interface JavaEmulatorCommand {
  binary: string;
  args: string[];
}

export interface JavaEmulatorDetails {
  name: string;
  instance: ChildProcess | null;
  stdout: any | null;
  cacheDir: string;
  remoteUrl: string;
  expectedSize: number;
  expectedChecksum: string;
  localPath: string;
}

export interface Address {
  host: string;
  port: number;
}

export class EmulatorLog {
  static fromJSON(json: string): EmulatorLog {
    const log = JSON.parse(json);
    return new EmulatorLog(log.level, log.text, log.data, log.timestamp);
  }

  constructor(
    public level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | "SYSTEM" | "USER",
    public text: string,
    public data?: any,
    public timestamp?: string
  ) {
    if (!this.timestamp) {
      this.timestamp = new Date().toString();
    }
  }

  toString(): string {
    return JSON.stringify({
      timestamp: this.timestamp,
      level: this.level,
      text: this.text,
      data: this.data,
    });
  }

  get date(): Date {
    if (!this.timestamp) {
      return new Date(0);
    }
    return new Date(this.timestamp);
  }

  log(): void {
    process.stdout.write(`${this.toString()}\n`);
  }
}
