import * as clc from "cli-color";

import * as extensionsApi from "../../extensions/extensionsApi";
import * as refs from "../../extensions/refs";
import * as utils from "../../utils";
import { ErrorHandler } from "./errors";
import { InstanceSpec } from "./planner";

const isRetryable = (err: any) => err.status == 429 || err.status == 409;

export type DeploymentType = "create" | "update" | "configure" | "delete";
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
      if (isRetryable(err)) {
        // Rethrow quota errors or operation already in progress so that throttler retries them.
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
    const res = await extensionsApi.updateInstanceFromRegistry({
      projectId,
      instanceId: instanceSpec.instanceId,
      extRef: refs.toExtensionVersionRef(instanceSpec.ref!),
      params: instanceSpec.params,
      validateOnly,
    });
    printSuccess(instanceSpec.instanceId, "update", validateOnly);
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "update",
  };
}

export function configureExtensionInstanceTask(
  projectId: string,
  instanceSpec: InstanceSpec,
  validateOnly: boolean = false
): ExtensionDeploymentTask {
  const run = async () => {
    const res = await extensionsApi.configureInstance({
      projectId,
      instanceId: instanceSpec.instanceId,
      params: instanceSpec.params,
      validateOnly,
    });
    printSuccess(instanceSpec.instanceId, "configure", validateOnly);
    return;
  };
  return {
    run,
    spec: instanceSpec,
    type: "configure",
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

function printSuccess(instanceId: string, type: DeploymentType, validateOnly: boolean) {
  const action = validateOnly ? `validated ${type} for` : `${type}d`;
  utils.logSuccess(clc.bold.green("extensions") + ` Successfully ${action} ${instanceId}`);
}
