/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as winston from "winston";
import * as Transport from "winston-transport";

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

const rawLogger = winston.createLogger();
// Set a default silent logger to suppress logs during tests
rawLogger.add(new winston.transports.Console({ silent: true }));
rawLogger.exitOnError = false;

// The type system for TypeScript is a bit wonky. The type of winston.LeveledLogMessage
// and winston.LogMessage is an interface of function overloads. There's no easy way to
// extend that and also subclass Logger to change the return type of those methods to
// allow error parameters.
// Casting looks super dodgy, but it should be safe because we know the underlying code
// handles all parameter types we care about.
export const logger = annotateDebugLines(expandErrors(rawLogger)) as unknown as Logger;
