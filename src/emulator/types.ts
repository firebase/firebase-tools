import { ChildProcess } from "child_process";

export enum Emulators {
  FUNCTIONS = "functions",
  FIRESTORE = "firestore",
  DATABASE = "database",
  HOSTING = "hosting",
}

// TODO: Is there a way we can just allow iteration over the enum?
export const ALL_EMULATORS = [
  Emulators.FUNCTIONS,
  Emulators.FIRESTORE,
  Emulators.DATABASE,
  Emulators.HOSTING,
];

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
  host: string;
  port: number;
}

export interface JavaEmulatorCommand {
  binary: string;
  args: string[];
  optionalArgs: string[];
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
  // Messages over 8192 bytes cause issues
  static CHUNK_DIVIDER = "__CHUNK__";
  static CHUNK_SIZE = 8000;

  private static LOG_BUFFER: string[] = [];

  get date(): Date {
    if (!this.timestamp) {
      return new Date(0);
    }
    return new Date(this.timestamp);
  }
  static fromJSON(json: string): EmulatorLog {
    let parsedLog;
    let isNotJSON = false;
    try {
      parsedLog = JSON.parse(json);
    } catch (err) {
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

  constructor(
    public level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | "SYSTEM" | "USER",
    public type: string,
    public text: string,
    public data?: any,
    public timestamp?: string
  ) {
    this.timestamp = this.timestamp || new Date().toString();
    this.data = this.data || {};
  }

  toString(): string {
    return this.toStringCore(false);
  }

  toPrettyString(): string {
    return this.toStringCore(true);
  }

  log(): void {
    const msg = `${this.toString()}\n`;
    const chunks = this.chunkString(msg);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLast = i === chunks.length - 1;
      if (isLast) {
        this.bufferMessage(chunk);
      } else {
        this.bufferMessage(chunk + EmulatorLog.CHUNK_DIVIDER);
      }
    }

    this.flush();
  }

  private bufferMessage(msg: string) {
    EmulatorLog.LOG_BUFFER.push(msg);
  }

  private flush(): void {
    const nextMsg = EmulatorLog.LOG_BUFFER.shift();
    if (!nextMsg) {
      return;
    }

    process.stdout.write(nextMsg);
    this.flush();
  }

  private chunkString(msg: string): string[] {
    const chunks: string[] = [];
    const numChunks = Math.ceil(msg.length / EmulatorLog.CHUNK_SIZE);

    for (let i = 0; i < numChunks; i++) {
      const start = i * EmulatorLog.CHUNK_SIZE;
      const length = EmulatorLog.CHUNK_SIZE;
      chunks.push(msg.substr(start, length));
    }

    return chunks;
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
