import * as clc from "cli-color";

import { InstanceSpec } from "./planner";
import { ErrorHandler } from "./errors";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as utils from "../../utils";
import * as refs from "../../extensions/refs";
import { OperationType } from "../functions/tasks";
import { instanceId } from "firebase-admin";

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
    } catch (err) {
      if (err.status == 429) {
        // Throw quota errors so that throttler retries them.
        throw err;
      }
      errorHandler.record(
        task.spec.instanceId,
        task.type,
        err.context?.body?.error?.message ?? err
      );
    }
    return result;
  };
}

export function createExtensionInstanceTask(
  projectId: string,
  instanceSpec: InstanceSpec,
  validateOnly: boolean = false
): ExtensionDeploymentTask {
  const run = async () => {
    const res = await extensionsApi.createInstance({
      projectId,
      instanceId: instanceSpec.instanceId,
      params: instanceSpec.params,
      extensionVersionRef: refs.toExtensionVersionRef(instanceSpec.ref!),
      validateOnly,
    });
    printSuccess(instanceSpec.instanceId, "create", validateOnly);
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
    printSuccess(instanceSpec.instanceId, "update", validateOnly);
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
    printSuccess(instanceSpec.instanceId, "delete", false);
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "delete",
  };
}

function printSuccess(instanceId: string, type: OperationType, validateOnly: boolean) {
  const action = validateOnly ? `validated ${type} for` : `${type}d`;
  utils.logSuccess(clc.bold.green("extensions") + ` Successfully ${action} ${instanceId}`);
}
