import * as utils from "../utils";
import * as logger from "../logger";

type LogType = "DEBUG" | "INFO" | "USER" | "BULLET" | "WARN" | "SUCCESS";

const NEVER_QUIET: LogType[] = ["USER", "WARN"];

export class EmulatorLogger {
  static quiet: boolean = false;

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
    }
  }

  private static shouldSupress(type: LogType): boolean {
    return EmulatorLogger.quiet && NEVER_QUIET.indexOf(type) < 0;
  }
}
