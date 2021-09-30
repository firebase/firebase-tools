import * as clc from "cli-color";

import { InstanceSpec } from "./planner";
import { ErrorHandler } from "./errors";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as utils from "../../utils";

export type DeploymentType = "create" | "update" | "delete";
export interface ExtensionDeploymentTask {
  run: () => Promise<void>,
  spec: InstanceSpec,
  type: DeploymentType,
}
export function extensionsDeploymentHandler(
  errorHandler: ErrorHandler
): (task: ExtensionDeploymentTask) => Promise<any | undefined> {
  return async (task: ExtensionDeploymentTask) => {
    let result;
    try {
      result = await task.run();
      printSuccess(task);
    } catch (err) {
      if (err.statusCode == 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      }
      errorHandler.record(task.spec.instanceId, task.type, err.message ?? err);
    }
    return result;
  };
}

export function createExtensionInstanceTask(instanceSpec: InstanceSpec): ExtensionDeploymentTask {
  const run = async () => {

  }
  return {
    run,
    spec: instanceSpec,
    type: "create",
  }
}

function printSuccess(task: ExtensionDeploymentTask) {
  utils.logSuccess(
    clc.bold.green(task.spec.instanceId) +
      `Successfully ${task.type}d ${task.spec.instanceId}`
  );
}