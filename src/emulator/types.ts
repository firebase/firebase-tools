import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

export enum Emulators {
  AUTH = "auth",
  HUB = "hub",
  FUNCTIONS = "functions",
  FIRESTORE = "firestore",
  DATABASE = "database",
  HOSTING = "hosting",
  PUBSUB = "pubsub",
  UI = "ui",
  LOGGING = "logging",
  STORAGE = "storage",
  EXTENSIONS = "extensions",
  EVENTARC = "eventarc",
  REMOTE_CONFIG = "remote config",
}

export type DownloadableEmulators =
  | Emulators.FIRESTORE
  | Emulators.DATABASE
  | Emulators.PUBSUB
  | Emulators.UI
  | Emulators.STORAGE;
export const DOWNLOADABLE_EMULATORS = [
  Emulators.FIRESTORE,
  Emulators.DATABASE,
  Emulators.PUBSUB,
  Emulators.UI,
  Emulators.STORAGE,
];

export type ImportExportEmulators = Emulators.FIRESTORE | Emulators.DATABASE | Emulators.AUTH;
export const IMPORT_EXPORT_EMULATORS = [
  Emulators.FIRESTORE,
  Emulators.DATABASE,
  Emulators.AUTH,
  Emulators.STORAGE,
];

export const ALL_SERVICE_EMULATORS = [
  Emulators.AUTH,
  Emulators.FUNCTIONS,
  Emulators.FIRESTORE,
  Emulators.DATABASE,
  Emulators.HOSTING,
  Emulators.PUBSUB,
  Emulators.STORAGE,
  Emulators.EVENTARC,
  Emulators.REMOTE_CONFIG,
].filter((v) => v);

export const EMULATORS_SUPPORTED_BY_FUNCTIONS = [
  Emulators.FIRESTORE,
  Emulators.DATABASE,
  Emulators.PUBSUB,
  Emulators.STORAGE,
  Emulators.EVENTARC,
];

export const EMULATORS_SUPPORTED_BY_UI = [
  Emulators.AUTH,
  Emulators.DATABASE,
  Emulators.FIRESTORE,
  Emulators.FUNCTIONS,
  Emulators.STORAGE,
  Emulators.EXTENSIONS,
  Emulators.REMOTE_CONFIG,
];

export const EMULATORS_SUPPORTED_BY_USE_EMULATOR = [
  Emulators.AUTH,
  Emulators.DATABASE,
  Emulators.FIRESTORE,
  Emulators.FUNCTIONS,
  Emulators.STORAGE,
];

// TODO: Is there a way we can just allow iteration over the enum?
export const ALL_EMULATORS = [
  Emulators.HUB,
  Emulators.UI,
  Emulators.LOGGING,
  Emulators.EXTENSIONS,
  ...ALL_SERVICE_EMULATORS,
];

/**
 * @param value
 */
export function isDownloadableEmulator(value: string): value is DownloadableEmulators {
  return isEmulator(value) && DOWNLOADABLE_EMULATORS.includes(value);
}

/**
 * @param value
 */
export function isEmulator(value: string): value is Emulators {
  return Object.values(Emulators).includes(value as Emulators);
}

export interface EmulatorInstance {
  /**
   * Called to begin the emulator process.
   *
   * Note: you should almost always call EmulatorRegistry.start() instead of this method.
   */
  start(): Promise<void>;

  /**
   * Called to tell the emulator to connect to other running emulators.
   * This must be called after start().
   */
  connect(): Promise<void>;

  /**
   * Called to stop the emulator process.
   *
   * Note: you should almost always call EmulatorRegistry.stop() instead of this method.
   */
  stop(): Promise<void>;

  /**
   * Get the information about the running instance needed by the registry;
   */
  getInfo(): EmulatorInfo;

  /**
   * Get the name of the corresponding service.
   */
  getName(): Emulators;
}

export interface EmulatorInfo {
  name: Emulators;
  pid?: number;
  reservedPorts?: number[];

  /** All addresses that an emulator listens on. */
  listen?: ListenSpec[];

  /** The primary IP address that the emulator listens on. */
  host: string;
  port: number;
}

export interface DownloadableEmulatorCommand {
  binary: string;
  args: string[];
  optionalArgs: string[];
  joinArgs: boolean;
}

export interface EmulatorDownloadOptions {
  cacheDir: string;
  remoteUrl: string;
  expectedSize: number;
  expectedChecksum: string;
  namePrefix: string;
  skipChecksumAndSize?: boolean;
  skipCache?: boolean;
}

export interface EmulatorUpdateDetails {
  version: string;
  expectedSize: number;
  expectedChecksum: string;
}

export interface EmulatorDownloadDetails {
  opts: EmulatorDownloadOptions;

  // Semver version string
  version: string;

  // The path to download the binary or archive from the remote source
  downloadPath: string;

  // If specified, the artifact at 'downloadPath' is assumed to be a .zip and
  // will be unzipped into 'unzipDir'
  unzipDir?: string;

  // If specified, a path where the runnable binary can be found after downloading and
  // unzipping. Otherwise downloadPath will be used.
  binaryPath?: string;
}

export interface DownloadableEmulatorDetails {
  name: Emulators;
  instance: ChildProcess | null;
  stdout: any | null;
}

export interface ListenSpec {
  address: string;
  port: number;
  family: "IPv4" | "IPv6";
}

export enum FunctionsExecutionMode {
  // Function workers will be spawned as needed with no particular
  // guarantees.
  AUTO = "auto",

  // All function executions will be run sequentially in a single worker.
  SEQUENTIAL = "sequential",
}

export class EmulatorLog {
  get date(): Date {
    if (!this.timestamp) {
      return new Date(0);
    }
    return new Date(this.timestamp);
  }

  static waitForFlush(): Promise<void> {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!EmulatorLog.WAITING_FOR_FLUSH) {
          resolve();
          clearInterval(interval);
        }
      }, 10);
    });
  }

  static waitForLog(
    emitter: EventEmitter,
    level: string,
    type: string,
    filter?: (el: EmulatorLog) => boolean
  ): Promise<EmulatorLog> {
    return new Promise((resolve) => {
      const listener = (el: EmulatorLog) => {
        const levelTypeMatch = el.level === level && el.type === type;
        let filterMatch = true;
        if (filter) {
          filterMatch = filter(el);
        }

        if (levelTypeMatch && filterMatch) {
          emitter.removeListener("log", listener);
          resolve(el);
        }
      };
      emitter.on("log", listener);
    });
  }

  static fromJSON(json: string): EmulatorLog {
    let parsedLog;
    let isNotJSON = false;
    try {
      parsedLog = JSON.parse(json);
    } catch (err: any) {
      isNotJSON = true;
    }

    parsedLog = parsedLog || {};

    if (
      isNotJSON ||
      parsedLog.level === undefined ||
      parsedLog.type === undefined ||
      parsedLog.text === undefined
    ) {
      parsedLog = {
        level: "USER",
        type: "function-log",
        text: json,
      };
    }

    return new EmulatorLog(
      parsedLog.level,
      parsedLog.type,
      parsedLog.text,
      parsedLog.data,
      parsedLog.timestamp
    );
  }

  private static WAITING_FOR_FLUSH = false;
  private static LOG_BUFFER: string[] = [];

  constructor(
    public level: "DEBUG" | "INFO" | "WARN" | "WARN_ONCE" | "ERROR" | "FATAL" | "SYSTEM" | "USER",
    public type: string,
    public text: string,
    public data?: any,
    public timestamp?: string
  ) {
    this.timestamp = this.timestamp || new Date().toISOString();
    this.data = this.data || {};
  }

  toString(): string {
    return this.toStringCore(false);
  }

  toPrettyString(): string {
    return this.toStringCore(true);
  }

  /**
   * We use a global boolean to know if all of our messages have been flushed, and the functions
   * emulator can wait on this variable to flip before exiting. This ensures that we never
   * miss a log message that has been queued but has not yet flushed.
   */
  log(): void {
    const msg = `${this.toString()}\n`;
    this.bufferMessage(msg);
    this.flush();
  }

  private bufferMessage(msg: string): void {
    EmulatorLog.LOG_BUFFER.push(msg);
  }

  private flush(): void {
    const nextMsg = EmulatorLog.LOG_BUFFER.shift();
    if (!nextMsg) {
      return;
    }

    EmulatorLog.WAITING_FOR_FLUSH = true;
    if (process.send) {
      // For some reason our node.d.ts file does not include the version of subprocess.send() with a callback
      // but the node docs assert that it has an optional callback.
      // https://nodejs.org/api/child_process.html#child_process_subprocess_send_message_sendhandle_options_callback
      (process.send as any)(nextMsg, undefined, {}, (err: any) => {
        if (err) {
          process.stderr.write(err);
        }

        EmulatorLog.WAITING_FOR_FLUSH = EmulatorLog.LOG_BUFFER.length > 0;
        this.flush();
      });
    } else {
      process.stderr.write(
        "subprocess.send() is undefined, cannot communicate with Functions Runtime."
      );
    }
  }

  private toStringCore(pretty = false): string {
    return JSON.stringify(
      {
        timestamp: this.timestamp,
        level: this.level,
        text: this.text,
        data: this.data,
        type: this.type,
      },
      undefined,
      pretty ? 2 : 0
    );
  }
}

/**
 * google.firebase.rules.v1.Issue
 */
export interface Issue {
  sourcePosition: SourcePosition;
  description: string;
  severity: Severity;
}

export enum Severity {
  SEVERITY_UNSPECIFIED = 0,
  DEPRECATION = 1,
  WARNING = 2,
  ERROR = 3,
}

export interface SourcePosition {
  fileName: string;
  fileIndex: number;
  line: number;
  column: number;
}
