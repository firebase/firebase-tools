import * as clc from "cli-color";

import { InstanceSpec } from "./planner";
import { ErrorHandler } from "./errors";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as utils from "../../utils";
import * as refs from "../../extensions/refs";

export type DeploymentType = "create" | "update" | "delete";
export interface ExtensionDeploymentTask {
  run: () => Promise<void>;
  spec: InstanceSpec;
  type: DeploymentType;
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

export function createExtensionInstanceTask(
  projectId: string,
  instanceSpec: InstanceSpec,
  validateOnly: boolean = false,
): ExtensionDeploymentTask {
  const run = async () => {
    const res = await extensionsApi.createInstance({
      projectId,
      instanceId: instanceSpec.instanceId,
      params: instanceSpec.params,
      extensionVersionRef: refs.toExtensionVersionRef(instanceSpec.ref!),
      validateOnly,
    });
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "create",
  };
}

export function updateExtensionInstanceTask(
  projectId: string,
  instanceSpec: InstanceSpec,
  validateOnly: boolean = false
): ExtensionDeploymentTask {
  const run = async () => {
    const res = await extensionsApi.updateInstanceFromRegistry(
      projectId,
      instanceSpec.instanceId,
      refs.toExtensionVersionRef(instanceSpec.ref!),
      instanceSpec.params,
      validateOnly
    );
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "update",
  };
}

export function deleteExtensionInstanceTask(
  projectId: string,
  instanceSpec: InstanceSpec
): ExtensionDeploymentTask {
  const run = async () => {
    const res = await extensionsApi.deleteInstance(projectId, instanceSpec.instanceId);
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "delete",
  };
}

function printSuccess(task: ExtensionDeploymentTask) {
  utils.logSuccess(
    clc.bold.green(task.spec.instanceId) + `Successfully ${task.type}d ${task.spec.instanceId}`
  );
}
