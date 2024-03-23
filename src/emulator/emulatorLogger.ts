import * as clc from "colorette";

import * as utils from "../utils";
import { logger } from "../logger";
import { EmulatorLog, Emulators } from "./types";
import { tryParse } from "../utils";
import { LogData } from "./loggingEmulator";

/**
 * DEBUG - lowest level, not needed for most usages.
 * INFO / BULLET - useful to humans, bullet logs with a fancier style.
 * SUCCESS - useful to humans, similar to bullet but in a 'success' style.
 * USER - logged by user code, always show to humans.
 * WARN - warnings from our code that humans need.
 * WARN_ONCE - warnings from our code that humans need, but only once per session.
 * ERROR - error from our code that humans need.
 */
type LogType = "DEBUG" | "INFO" | "BULLET" | "SUCCESS" | "USER" | "WARN" | "WARN_ONCE" | "ERROR";

const TYPE_VERBOSITY: { [type in LogType]: number } = {
  DEBUG: 0,
  INFO: 1,
  BULLET: 1,
  SUCCESS: 1,
  USER: 2,
  WARN: 2,
  WARN_ONCE: 2,
  ERROR: 2,
};

export enum Verbosity {
  DEBUG = 0,
  INFO = 1,
  QUIET = 2,
  SILENT = 3,
}
export type ExtensionLogInfo = {
  ref?: string;
  instanceId?: string;
};

export class EmulatorLogger {
  private static verbosity: Verbosity = Verbosity.DEBUG;
  static warnOnceCache = new Set<string>();

  constructor(
    public readonly name: string,
    private data: LogData = {},
  ) {}

  static setVerbosity(verbosity: Verbosity) {
    EmulatorLogger.verbosity = verbosity;
  }

  static forEmulator(emulator: Emulators) {
    return new EmulatorLogger(emulator, {
      metadata: {
        emulator: {
          name: emulator,
        },
      },
    });
  }

  static forFunction(functionName: string, extensionLogInfo?: ExtensionLogInfo): EmulatorLogger {
    return new EmulatorLogger(Emulators.FUNCTIONS, {
      metadata: {
        emulator: {
          name: Emulators.FUNCTIONS,
        },
        function: {
          name: functionName,
        },
        extension: extensionLogInfo,
      },
    });
  }

  static forExtension(extensionLogInfo: ExtensionLogInfo): EmulatorLogger {
    return new EmulatorLogger(Emulators.EXTENSIONS, {
      metadata: {
        emulator: {
          name: Emulators.EXTENSIONS,
        },
        extension: extensionLogInfo,
      },
    });
  }

  /**
   * Within this file, utils.logFoo() or logger.Foo() should not be called directly,
   * so that we can respect the "quiet" flag.
   *
   * @param type
   * @param text
   * @param data
   */
  log(type: LogType, text: string, data?: LogData): void {
    if (!data) {
      data = this.data;
    }

    if (EmulatorLogger.shouldSupress(type)) {
      logger.debug(`${type}: ${text}`);
      return;
    }

    const mergedData = {
      ...data,
      metadata: {
        ...data.metadata,
        message: text,
      },
    };

    switch (type) {
      case "DEBUG":
        logger.debug(text, mergedData);
        break;
      case "INFO":
        logger.info(text, mergedData);
        break;
      case "USER":
        logger.info(text, mergedData);
        break;
      case "BULLET":
        utils.logBullet(text, "info", mergedData);
        break;
      case "WARN":
        utils.logWarning(text, "warn", mergedData);
        break;
      case "WARN_ONCE":
        if (!EmulatorLogger.warnOnceCache.has(text)) {
          utils.logWarning(text, "warn", mergedData);
          EmulatorLogger.warnOnceCache.add(text);
        }
        break;
      case "SUCCESS":
        utils.logSuccess(text, "info", mergedData);
        break;
      case "ERROR":
        utils.logBullet(text, "error", mergedData);
        break;
    }
  }

  handleRuntimeLog(log: EmulatorLog, ignore: string[] = []): void {
    if (ignore.includes(log.level)) {
      return;
    }
    switch (log.level) {
      case "SYSTEM":
        this.handleSystemLog(log);
        break;
      case "USER":
        this.log("USER", `${clc.blackBright("> ")} ${log.text}`, {
          user: tryParse(log.text),
          ...this.data,
        });
        break;
      case "DEBUG":
        if (log.data && Object.keys(log.data).length > 0) {
          this.log("DEBUG", `[${log.type}] ${log.text} ${JSON.stringify(log.data)}`);
        } else {
          this.log("DEBUG", `[${log.type}] ${log.text}`);
        }
        break;
      case "INFO":
        this.logLabeled("BULLET", "functions", log.text);
        break;
      case "WARN":
        this.logLabeled("WARN", "functions", log.text);
        break;
      case "WARN_ONCE":
        this.logLabeled("WARN_ONCE", "functions", log.text);
        break;
      case "FATAL":
        this.logLabeled("WARN", "functions", log.text);
        break;
      default:
        this.log("INFO", `${log.level}: ${log.text}`);
        break;
    }
  }

  handleSystemLog(systemLog: EmulatorLog): void {
    switch (systemLog.type) {
      case "runtime-status":
        if (systemLog.text === "killed") {
          this.log("WARN", `Your function was killed because it raised an unhandled error.`);
        }
        break;
      case "googleapis-network-access":
        this.log(
          "WARN",
          `Google API requested!\n   - URL: "${systemLog.data.href}"\n   - Be careful, this may be a production service.`,
        );
        break;
      case "unidentified-network-access":
        this.log(
          "WARN",
          `External network resource requested!\n   - URL: "${systemLog.data.href}"\n - Be careful, this may be a production service.`,
        );
        break;
      case "functions-config-missing-value":
        this.log(
          "WARN_ONCE",
          `It looks like you're trying to access functions.config().${systemLog.data.key} but there is no value there. You can learn more about setting up config here: https://firebase.google.com/docs/functions/local-emulator`,
        );
        break;
      case "non-default-admin-app-used":
        this.log(
          "WARN",
          `Non-default "firebase-admin" instance created!\n   ` +
            `- This instance will *not* be mocked and will access production resources.`,
        );
        break;
      case "missing-module":
        this.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be installed as a ${
            systemLog.data.isDev ? "development dependency" : "dependency"
          }. To fix this, run "npm install ${systemLog.data.isDev ? "--save-dev" : "--save"} ${
            systemLog.data.name
          }" in your functions directory.`,
        );
        break;
      case "uninstalled-module":
        this.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${systemLog.data.name}" to be installed. This package is in your package.json, but it's not available. \
You probably need to run "npm install" in your functions directory.`,
        );
        break;
      case "out-of-date-module":
        this.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${systemLog.data.name}" to be version >${systemLog.data.minVersion} so your version is too old. \
You can probably fix this by running "npm install ${systemLog.data.name}@latest" in your functions directory.`,
        );
        break;
      case "missing-package-json":
        this.log(
          "WARN",
          `The Cloud Functions directory you specified does not have a "package.json" file, so we can't load it.`,
        );
        break;
      case "function-code-resolution-failed":
        this.log("WARN", systemLog.data.error);
        const helper = ["We were unable to load your functions code. (see above)"];
        if (systemLog.data.isPotentially.wrong_directory) {
          helper.push(`   - There is no "package.json" file in your functions directory.`);
        }
        if (systemLog.data.isPotentially.typescript) {
          helper.push(
            "   - It appears your code is written in Typescript, which must be compiled before emulation.",
          );
        }
        if (systemLog.data.isPotentially.uncompiled) {
          helper.push(
            `   - You may be able to run "npm run build" in your functions directory to resolve this.`,
          );
        }
        utils.logWarning(helper.join("\n"), "warn", this.data);
        break;
      case "function-runtimeconfig-json-invalid":
        this.log("WARN", "Found .runtimeconfig.json but the JSON format is invalid.");
        break;
      default:
      // Silence
    }
  }

  /**
   * Within this file, utils.logLabeldFoo() should not be called directly,
   * so that we can respect the "quiet" flag.
   *
   * @param type
   * @param label
   * @param text
   * @param data
   */
  logLabeled(type: LogType, text: string): void;
  logLabeled(type: LogType, label: string, text: string): void;
  logLabeled(type: LogType, labelOrText: string, text?: string): void {
    let label = labelOrText;
    if (text === undefined) {
      text = label;
      label = this.name;
    }
    if (EmulatorLogger.shouldSupress(type)) {
      logger.debug(`[${label}] ${text}`);
      return;
    }

    const mergedData = {
      ...this.data,
      metadata: {
        ...this.data.metadata,
        message: text,
      },
    };

    switch (type) {
      case "DEBUG":
        logger.debug(`[${label}] ${text}`);
        break;
      case "BULLET":
        utils.logLabeledBullet(label, text, "info", mergedData);
        break;
      case "SUCCESS":
        utils.logLabeledSuccess(label, text, "info", mergedData);
        break;
      case "WARN":
        utils.logLabeledWarning(label, text, "warn", mergedData);
        break;
      case "WARN_ONCE":
        if (!EmulatorLogger.warnOnceCache.has(text)) {
          utils.logLabeledWarning(label, text, "warn", mergedData);
          EmulatorLogger.warnOnceCache.add(text);
        }
        break;
      case "ERROR":
        utils.logLabeledError(label, text, "error", mergedData);
        break;
    }
  }

  private static shouldSupress(type: LogType): boolean {
    const typeVerbosity = TYPE_VERBOSITY[type];
    return EmulatorLogger.verbosity > typeVerbosity;
  }
}
