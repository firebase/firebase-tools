import * as path from "path";
import * as vscode from "vscode";
import { transports, format } from "winston";
import Transport from "winston-transport";
import stripAnsi from "strip-ansi";
import { SPLAT } from "triple-beam";
import { logger as cliLogger } from "../../src/logger";
import { setupLoggers, tryStringify } from "../../src/utils";
import { setInquirerLogger } from "./stubs/inquirer-stub";
import { getRootFolders } from "./config-files";

export type LogLevel = "debug" | "info" | "log" | "warn" | "error";

export const pluginLogger: Record<LogLevel, (...args) => void> = {
  debug: () => {},
  info: () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
};

const outputChannel = vscode.window.createOutputChannel('Firebase');

export function showOutputChannel() {
  outputChannel.show();
}

for (const logLevel in pluginLogger) {
  pluginLogger[logLevel] = (...args) => {
    const prefixedArgs = ['[Firebase Plugin]', ...args];
    cliLogger[logLevel](...prefixedArgs);
  };
}

/**
 * Logging setup for logging to console and to file.
 */
export function logSetup({ shouldWriteDebug, debugLogPath }: {
  shouldWriteDebug: boolean,
  debugLogPath: string
}) {
  // Log to console (use built in CLI functionality)
  process.env.DEBUG = 'true';
  setupLoggers();

  // Log to file
  // Only log to file if firebase.debug extension setting is true.
  if (shouldWriteDebug) {
    // Re-implement file logger call from ../../src/bin/firebase.ts to not bring
    // in the entire firebase.ts file
    const rootFolders = getRootFolders();
    const filePath = debugLogPath || path.join(rootFolders[0], 'firebase-plugin-debug.log');
    pluginLogger.info('Logging to path', filePath);
    cliLogger.add(
      new transports.File({
        level: "debug",
        filename: filePath,
        format: format.printf((info) => {
          const segments = [info.message, ...(info[SPLAT] || [])]
            .map(tryStringify);
          return `[${info.level}] ${stripAnsi(segments.join(" "))}`;
        }),
      })
    );
    cliLogger.add(
      new VSCodeOutputTransport({ level: "info" })
    );
  }
}

/**
 * Custom Winston transport that writes to VSCode output channel.
 * Write only "info" and greater to avoid too much spam from "debug".
 */
class VSCodeOutputTransport extends Transport {
  constructor(opts) {
    super(opts);
  }
  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });
    const segments = [info.message, ...(info[SPLAT] || [])]
      .map(tryStringify);
    const text = `[${info.level}] ${stripAnsi(segments.join(" "))}`;

    if (info.level !== 'debug') {
      // info or greater: write to output window
      outputChannel.appendLine(text);
    }

    callback();
  }
}
setInquirerLogger(pluginLogger);
