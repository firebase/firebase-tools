import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { DeploymentType } from "./tasks";

interface ErrorInfo {
  instanceId: string;
  type: DeploymentType;
  message: string;
}

export class ErrorHandler {
  errors: ErrorInfo[] = [];

  record(instanceId: string, type: DeploymentType, err: FirebaseError) {
    this.errors.push({
      instanceId,
      type,
      message: err.message,
    });
  }

  print() {
    logger.info("");
    logger.info("Extensions deploy had errors:");
    logger.info("");
    for (const err of this.errors) {
      logger.info(`- ${err.type} ${clc.bold(err.instanceId)}`);
      logger.info(err.message);
      logger.info("");
    }
  }
}
