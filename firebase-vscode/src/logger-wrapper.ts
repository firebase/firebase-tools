import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import { transports, format } from "winston";
import Transport from "winston-transport";
import { stripVTControlCharacters } from "node:util";
import { SPLAT } from "triple-beam";
import { logger as cliLogger } from "../../src/logger";
import { setupLoggers, tryStringify } from "../../src/utils";
import { setInquirerLogger } from "./stubs/inquirer-stub";
import { getRootFolders } from "./core/config";

export type LogLevel = "debug" | "info" | "log" | "warn" | "error";

export const pluginLogger: Record<LogLevel, (...args: any) => void> = {
  debug: () => {},
  info: () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
};

const outputChannel = vscode.window.createOutputChannel("Firebase");

export function showOutputChannel() {
  outputChannel.show();
}

for (const logLevel in pluginLogger) {
  pluginLogger[logLevel as LogLevel] = (...args: any) => {
    const prefixedArgs = ["[Firebase Plugin]", ...args];
    (cliLogger[logLevel as LogLevel] as any)(...prefixedArgs);
  };
}

/**
 * Logging setup for logging to console and to file.
 */
export function logSetup() {
  // Log to console (use built in CLI functionality)
  process.env.DEBUG = "true";
  setupLoggers();

  // Log to file
  // Only log to file if firebase.debug extension setting is true.
  // Re-implement file logger call from ../../src/bin/firebase.ts to not bring
  // in the entire firebase.ts file
  const rootFolders = getRootFolders();
  // Default to a central path, but write files to a local path if we're in a Firebase directory.
  let filePath = path.join(
    os.homedir(),
    ".cache",
    "firebase",
    "logs",
    "vsce-debug.log",
  );
  if (
    rootFolders.length > 0 &&
    fs.existsSync(path.join(rootFolders[0], "firebase.json"))
  ) {
    filePath = path.join(rootFolders[0], ".firebase", "logs", "vsce-debug.log");
  }
  pluginLogger.info("Logging to path", filePath);
  cliLogger.add(
    new transports.File({
      level: "debug",
      filename: filePath,
      format: format.printf((info) => {
        const segments = [info.message, ...(info[SPLAT] || [])].map(
          tryStringify,
        );
        return `[${info.level}] ${stripVTControlCharacters(segments.join(" "))}`;
      }),
    }),
  );
  cliLogger.add(new VSCodeOutputTransport({ level: "info" }));
}

/**
 * Custom Winston transport that writes to VSCode output channel.
 * Write only "info" and greater to avoid too much spam from "debug".
 */
class VSCodeOutputTransport extends Transport {
  constructor(opts: any) {
    super(opts);
  }
  log(info: any, callback: any) {
    setImmediate(() => {
      this.emit("logged", info);
    });
    const segments = [info.message, ...(info[SPLAT] || [])].map(tryStringify);
    const text = `[${info.level}] ${stripVTControlCharacters(segments.join(" "))}`;

    if (info.level !== "debug") {
      // info or greater: write to output window
      outputChannel.appendLine(text);
    }

    callback();
  }
}
setInquirerLogger(pluginLogger);
