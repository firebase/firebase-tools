import * as clc from "cli-color";

import * as utils from "../utils";
import * as logger from "../logger";
import { EmulatorLog } from "./types";
import { tryParse } from "../utils";

/**
 * DEBUG - lowest level, not needed for most usages.
 * INFO / BULLET - useful to humans, bullet logs with a fancier style.
 * SUCCESS - useful to humans, similar to bullet but in a 'success' style.
 * USER - logged by user code, always show to humans.
 * WARN - warnings from our code that humans need.
 * WARN_ONCE - warnings from our code that humans need, but only once per session.
 */
type LogType = "DEBUG" | "INFO" | "BULLET" | "SUCCESS" | "USER" | "WARN" | "WARN_ONCE";

const TYPE_VERBOSITY: { [type in LogType]: number } = {
  DEBUG: 0,
  INFO: 1,
  BULLET: 1,
  SUCCESS: 1,
  USER: 2,
  WARN: 2,
  WARN_ONCE: 2,
};

export enum Verbosity {
  DEBUG = 0,
  INFO = 1,
  QUIET = 2,
}

export class EmulatorLogger {
  static verbosity: Verbosity = Verbosity.DEBUG;
  static warnOnceCache = new Set<String>();

  /**
   * Within this file, utils.logFoo() or logger.Foo() should not be called directly,
   * so that we can respect the "quiet" flag.
   */
  static log(type: LogType, text: string, data?: any): void {
    if (EmulatorLogger.shouldSupress(type)) {
      logger.debug(`${type}: ${text}`);
      return;
    }

    switch (type) {
      case "DEBUG":
        logger.debug(text, data);
        break;
      case "INFO":
        logger.info(text, data);
        break;
      case "USER":
        logger.info(text, data);
        break;
      case "BULLET":
        utils.logBullet(text, data);
        break;
      case "WARN":
        utils.logWarning(text, data);
        break;
      case "WARN_ONCE":
        if (!this.warnOnceCache.has(text)) {
          utils.logWarning(text, data);
          this.warnOnceCache.add(text);
        }
        break;
      case "SUCCESS":
        utils.logSuccess(text, data);
        break;
    }
  }

  static handleRuntimeLog(log: EmulatorLog, ignore: string[] = []): void {
    if (ignore.indexOf(log.level) >= 0) {
      return;
    }
    switch (log.level) {
      case "SYSTEM":
        EmulatorLogger.handleSystemLog(log);
        break;
      case "USER":
        EmulatorLogger.log("USER", `${clc.blackBright("> ")} ${log.text}`, {
          user: tryParse(log.text),
        });
        break;
      case "DEBUG":
        if (log.data && Object.keys(log.data).length > 0) {
          EmulatorLogger.log("DEBUG", `[${log.type}] ${log.text} ${JSON.stringify(log.data)}`);
        } else {
          EmulatorLogger.log("DEBUG", `[${log.type}] ${log.text}`);
        }
        break;
      case "INFO":
        EmulatorLogger.logLabeled("BULLET", "functions", log.text);
        break;
      case "WARN":
        EmulatorLogger.logLabeled("WARN", "functions", log.text);
        break;
      case "WARN_ONCE":
        EmulatorLogger.logLabeled("WARN_ONCE", "functions", log.text);
        break;
      case "FATAL":
        EmulatorLogger.logLabeled("WARN", "functions", log.text);
        break;
      default:
        EmulatorLogger.log("INFO", `${log.level}: ${log.text}`);
        break;
    }
  }

  static handleSystemLog(systemLog: EmulatorLog): void {
    switch (systemLog.type) {
      case "runtime-status":
        if (systemLog.text === "killed") {
          EmulatorLogger.log(
            "WARN",
            `Your function was killed because it raised an unhandled error.`
          );
        }
        break;
      case "googleapis-network-access":
        EmulatorLogger.log(
          "WARN",
          `Google API requested!\n   - URL: "${systemLog.data.href}"\n   - Be careful, this may be a production service.`
        );
        break;
      case "unidentified-network-access":
        EmulatorLogger.log(
          "WARN",
          `External network resource requested!\n   - URL: "${systemLog.data.href}"\n - Be careful, this may be a production service.`
        );
        break;
      case "functions-config-missing-value":
        EmulatorLogger.log(
          "WARN",
          `Non-existent functions.config() value requested!\n   - Path: "${systemLog.data.valuePath}"\n   - Learn more at https://firebase.google.com/docs/functions/local-emulator`
        );
        break;
      case "non-default-admin-app-used":
        EmulatorLogger.log(
          "WARN",
          `Non-default "firebase-admin" instance created!\n   ` +
            `- This instance will *not* be mocked and will access production resources.`
        );
        break;
      case "missing-module":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be installed as a ${
            systemLog.data.isDev ? "development dependency" : "dependency"
          }. To fix this, run "npm install ${systemLog.data.isDev ? "--save-dev" : "--save"} ${
            systemLog.data.name
          }" in your functions directory.`
        );
        break;
      case "uninstalled-module":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${systemLog.data.name}" to be installed. This package is in your package.json, but it's not available. \
You probably need to run "npm install" in your functions directory.`
        );
        break;
      case "out-of-date-module":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${systemLog.data.name}" to be version >${systemLog.data.minVersion} so your version is too old. \
You can probably fix this by running "npm install ${systemLog.data.name}@latest" in your functions directory.`
        );
        break;
      case "missing-package-json":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions directory you specified does not have a "package.json" file, so we can't load it.`
        );
        break;
      case "function-code-resolution-failed":
        EmulatorLogger.log("WARN", systemLog.data.error);
        const helper = ["We were unable to load your functions code. (see above)"];
        if (systemLog.data.isPotentially.wrong_directory) {
          helper.push(`   - There is no "package.json" file in your functions directory.`);
        }
        if (systemLog.data.isPotentially.typescript) {
          helper.push(
            "   - It appears your code is written in Typescript, which must be compiled before emulation."
          );
        }
        if (systemLog.data.isPotentially.uncompiled) {
          helper.push(
            `   - You may be able to run "npm run build" in your functions directory to resolve this.`
          );
        }
        utils.logWarning(helper.join("\n"));
      default:
      // Silence
    }
  }

  /**
   * Within this file, utils.logLabeldFoo() should not be called directly,
   * so that we can respect the "quiet" flag.
   */
  static logLabeled(type: LogType, label: string, text: string): void {
    if (EmulatorLogger.shouldSupress(type)) {
      logger.debug(`[${label}] ${text}`);
      return;
    }

    switch (type) {
      case "DEBUG":
        logger.debug(`[${label}] ${text}`);
        break;
      case "BULLET":
        utils.logLabeledBullet(label, text);
        break;
      case "SUCCESS":
        utils.logLabeledSuccess(label, text);
        break;
      case "WARN":
        utils.logLabeledWarning(label, text);
        break;
      case "WARN_ONCE":
        if (!this.warnOnceCache.has(text)) {
          utils.logLabeledWarning(label, text);
          this.warnOnceCache.add(text);
        }
        break;
    }
  }

  private static shouldSupress(type: LogType): boolean {
    const typeVerbosity = TYPE_VERBOSITY[type];
    return EmulatorLogger.verbosity > typeVerbosity;
  }
}
