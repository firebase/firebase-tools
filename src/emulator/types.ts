import { ChildProcess } from "child_process";

export interface EmulatorInstance {
  start(): Promise<any>;
  stop(): Promise<any>;
}

export enum Emulators {
  FUNCTIONS = "functions",
  FIRESTORE = "firestore",
  DATABASE = "database",
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
