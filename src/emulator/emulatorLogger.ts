import * as utils from "../utils";
import * as logger from "../logger";

/**
 * DEBUG - lowest level, not needed for most usages.
 * INFO / BULLET - useful to humans, bullet logs with a fancier style.
 * SUCCESS - useful to humans, similar to bullet but in a 'success' style.
 * USER - logged by user code, always show to humans.
 * WARN - warnings from our code that humans need.
 */
type LogType = "DEBUG" | "INFO" | "BULLET" | "SUCCESS" | "USER" | "WARN";

const TYPE_VERBOSITY: { [type in LogType]: number } = {
  DEBUG: 0,
  INFO: 1,
  BULLET: 1,
  SUCCESS: 1,
  USER: 2,
  WARN: 2,
};

export enum Verbosity {
  DEBUG = 0,
  INFO = 1,
  QUIET = 2,
}

export class EmulatorLogger {
  static verbosity: Verbosity = Verbosity.DEBUG;

  /**
   * Within this file, utils.logFoo() or logger.Foo() should not be called directly,
   * so that we can respect the "quiet" flag.
   */
  static log(type: LogType, text: string): void {
    if (EmulatorLogger.shouldSupress(type)) {
      logger.debug(`${type}: ${text}`);
      return;
    }

    switch (type) {
      case "DEBUG":
        logger.debug(text);
        break;
      case "INFO":
        logger.info(text);
        break;
      case "USER":
        logger.info(text);
        break;
      case "BULLET":
        utils.logBullet(text);
        break;
      case "WARN":
        utils.logWarning(text);
        break;
      case "SUCCESS":
        utils.logSuccess(text);
        break;
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
      case "BULLET":
        utils.logLabeledBullet(label, text);
        break;
      case "SUCCESS":
        utils.logLabeledSuccess(label, text);
        break;
      case "WARN":
        utils.logLabeledWarning(label, text);
        break;
    }
  }

  private static shouldSupress(type: LogType): boolean {
    const typeVerbosity = TYPE_VERBOSITY[type];
    return EmulatorLogger.verbosity > typeVerbosity;
  }
}
