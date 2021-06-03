import * as clc from "cli-color";

import { logger } from "../../logger";
import { getFunctionId, getFunctionLabel } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { OperationType } from "./tasks";

type Level = "error" | "warning";

interface ErrorInfo {
  functionName: string;
  operationType: OperationType;
  message: string;
}

export class ErrorHandler {
  errors: ErrorInfo[] = [];
  warnings: ErrorInfo[] = [];

  record(level: Level, functionName: string, operationType: OperationType, message: string): void {
    const info: ErrorInfo = {
      functionName,
      operationType,
      message,
    };
    if (level === "error") {
      this.errors.push(info);
    } else if (level === "warning") {
      this.warnings.push(info);
    }
  }

  printErrors() {
    if (this.errors.length === 0) {
      return;
    }
    logger.info("\nFunctions deploy had errors with the following functions:");
    for (const failedDeployment of this.errors) {
      logger.info(`\t${getFunctionLabel(failedDeployment.functionName)}`);
    }
    logger.info("\nTo try redeploying those functions, run:");
    logger.info(
      "    " +
        clc.bold("firebase deploy --only ") +
        clc.bold('"') +
        clc.bold(
          this.errors
            .map(
              (failedDeployment) =>
                `functions:${getFunctionId(failedDeployment.functionName).replace(/-/g, ".")}`
            )
            .join(",")
        ) +
        clc.bold('"')
    );
    logger.info("\nTo continue deploying other features (such as database), run:");
    logger.info("    " + clc.bold("firebase deploy --except functions"));
    // Print all the original messages at debug level.
    for (const failedDeployment of this.errors) {
      logger.debug(
        `\tError during ${failedDeployment.operationType} for ${failedDeployment.functionName}: ${failedDeployment.message}`
      );
    }
    throw new FirebaseError("Functions did not deploy properly.");
  }

  printWarnings() {
    if (this.warnings.length === 0) {
      return;
    }
    const failedIamCalls = this.warnings.filter((e) => e.operationType === "make public");
    if (failedIamCalls.length) {
      logger.info("\nUnable to set publicly accessible IAM policy on the following functions:");
      for (const failedDep of failedIamCalls) {
        logger.info(`\t${failedDep.functionName}`);
      }
      logger.info("\nUnauthenticated users will not be able access this function.");
      logger.info("\nSome common causes of this:");
      logger.info(
        "\n- You may not have the roles/functions.admin IAM role. Note that roles/functions.developer does not allow you to change IAM policies."
      );
      logger.info("\n- An organization policy that restricts Network Access on your project.");
    }

    // Print all the original messages at debug level.
    for (const failedDeployment of this.warnings) {
      logger.debug(
        `\tWarning during${failedDeployment.operationType} for ${failedDeployment.functionName}: ${failedDeployment.message}`
      );
    }
  }
}
