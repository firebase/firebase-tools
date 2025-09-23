import * as winston from "winston";
import * as Transport from "winston-transport";
import { EventEmitter } from "events";
import * as path from "path";
import * as fs from "fs";
import { SPLAT } from "triple-beam";
import { stripVTControlCharacters } from "util";

import { isVSCodeExtension } from "./vsCodeUtils";

/**
 * vsceLogEmitter passes CLI logs along to VSCode.
 *
 * Events are of the format winston.LogEntry
 * @example
 * vsceLogEmitter.on("log", (logEntry) => {
 *   if (logEntry.level == "error") {
 *     console.log(logEntry.message)
 *   }
 * })
 */
export const vsceLogEmitter = new EventEmitter();

export type LogLevel =
  | "error"
  | "warn"
  | "help"
  | "data"
  | "info"
  | "debug"
  | "prompt"
  | "http"
  | "verbose"
  | "input"
  | "silly";

// Extend the Winston log methods to support error signatures
export interface LogMethod extends winston.LogMethod {
  (level: LogLevel, err: Error, ...meta: any[]): Logger;
}

export interface LeveledLogMessage extends winston.LeveledLogMethod {
  // We use empty log messages to create newlines
  (): Logger;

  // We transform Errors to strings dynamically
  (err: Error, ...meta: any[]): Logger;
}

export interface Logger {
  log: LogMethod;

  error: LeveledLogMessage;
  warn: LeveledLogMessage;
  help: LeveledLogMessage;
  data: LeveledLogMessage;
  info: LeveledLogMessage;
  debug: LeveledLogMessage;
  prompt: LeveledLogMessage;
  http: LeveledLogMessage;
  verbose: LeveledLogMessage;
  input: LeveledLogMessage;
  silly: LeveledLogMessage;

  add(transport: Transport): Logger;
  remove(transport: Transport): Logger;

  silent: boolean;
}

function expandErrors(logger: winston.Logger): winston.Logger {
  const oldLogFunc: winston.LogMethod = logger.log.bind(logger);
  const newLogFunc: winston.LogMethod = function (
    levelOrEntry: string | winston.LogEntry,
    message?: string | Error,
    ...meta: any[]
  ): winston.Logger {
    if (message && message instanceof Error) {
      message = message.stack || message.message;
      return oldLogFunc(levelOrEntry as string, message, ...meta);
    }
    // Overloads are weird in TypeScript. This method works so long as the original
    // function isn't checking arguments.length.
    return oldLogFunc(levelOrEntry as string, message as string, ...meta);
  };
  logger.log = newLogFunc;
  return logger;
}

function annotateDebugLines(logger: winston.Logger): winston.Logger {
  const debug: winston.LeveledLogMethod = logger.debug.bind(logger);
  const newDebug: winston.LeveledLogMethod = function (
    message: string | any,
    ...meta: any[]
  ): winston.Logger {
    if (typeof message === "string") {
      message = `[${new Date().toISOString()}] ${message || ""}`;
    }
    return debug(message, ...meta);
  };
  logger.debug = newDebug;
  return logger;
}

function maybeUseVSCodeLogger(logger: winston.Logger): winston.Logger {
  if (!isVSCodeExtension()) {
    return logger;
  }
  const oldLogFunc = logger.log.bind(logger);
  const vsceLogger: winston.LogMethod = function (
    levelOrEntry: string | winston.LogEntry,
    message?: string | Error,
    ...meta: any[]
  ): winston.Logger {
    if (message) {
      vsceLogEmitter.emit("log", { level: levelOrEntry, message });
    } else {
      vsceLogEmitter.emit("log", levelOrEntry);
    }
    return oldLogFunc(levelOrEntry as string, message as string, ...meta);
  };
  logger.log = vsceLogger;
  return logger;
}

export function findAvailableLogFile(): string {
  const candidates = ["firebase-debug.log"];
  for (let i = 1; i < 10; i++) {
    candidates.push(`firebase-debug.${i}.log`);
  }

  for (const c of candidates) {
    const logFilename = path.join(process.cwd(), c);
    try {
      const fd = fs.openSync(logFilename, "r+");
      fs.closeSync(fd);
      return logFilename;
    } catch (e: any) {
      if (e.code === "ENOENT") {
        // File does not exist, which is fine
        return logFilename;
      }
      // Any other error (EPERM, etc) means we won't be able to log to
      // this file so we skip it.
    }
  }
  throw new Error("Unable to obtain permissions for firebase-debug.log");
}

export function tryStringify(value: any) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return value;
  }
}

const rawLogger = winston.createLogger();
// Set a default silent logger to suppress logs during tests
rawLogger.add(
  new winston.transports.Console({
    silent: true,
    consoleWarnLevels: ["debug", "warn"],
  }),
);
rawLogger.exitOnError = false;

// The type system for TypeScript is a bit wonky. The type of winston.LeveledLogMessage
// and winston.LogMessage is an interface of function overloads. There's no easy way to
// extend that and also subclass Logger to change the return type of those methods to
// allow error parameters.
// Casting looks super dodgy, but it should be safe because we know the underlying code
// handles all parameter types we care about.
export const logger: Logger = maybeUseVSCodeLogger(
  annotateDebugLines(expandErrors(rawLogger)),
) as unknown as Logger;

/**
 * Sets up logging to the firebase-debug.log file.
 */
export function useFileLogger(logFile?: string): string {
  const logFileName = logFile ?? findAvailableLogFile();
  logger.add(
    new winston.transports.File({
      level: "debug",
      filename: logFileName,
      format: winston.format.printf((info) => {
        const segments = [info.message, ...(info[SPLAT] || [])].map(tryStringify);
        return `[${info.level}] ${stripVTControlCharacters(segments.join(" "))}`;
      }),
    }),
  );
  return logFileName;
}

/**
 * Sets up logging to the command line.
 */
export function useConsoleLoggers(): void {
  if (process.env.DEBUG) {
    logger.add(
      new winston.transports.Console({
        level: "debug",
        format: winston.format.printf((info) => {
          const segments = [info.message, ...(info[SPLAT] || [])].map(tryStringify);
          return `${stripVTControlCharacters(segments.join(" "))}`;
        }),
      }),
    );
  } else if (process.env.IS_FIREBASE_CLI) {
    logger.add(
      new winston.transports.Console({
        level: "info",
        format: winston.format.printf((info) =>
          [info.message, ...(info[SPLAT] || [])]
            .filter((chunk) => typeof chunk === "string")
            .join(" "),
        ),
      }),
    );
  }
}
