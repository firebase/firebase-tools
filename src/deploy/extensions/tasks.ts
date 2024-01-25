import * as clc from "colorette";
import { FirebaseError } from "../../error";

import * as extensionsApi from "../../extensions/extensionsApi";
import { createSourceFromLocation } from "../../extensions/extensionsHelper";
import * as refs from "../../extensions/refs";
import * as utils from "../../utils";
import { ErrorHandler } from "./errors";
import { DeploymentInstanceSpec, InstanceSpec } from "./planner";

const isRetryable = (err: any) => err.status === 429 || err.status === 409;

export type DeploymentType = "create" | "update" | "configure" | "delete";
export interface ExtensionDeploymentTask {
  run: () => Promise<void>;
  spec: InstanceSpec;
  type: DeploymentType;
}
export function extensionsDeploymentHandler(
  errorHandler: ErrorHandler,
): (task: ExtensionDeploymentTask) => Promise<any | undefined> {
  return async (task: ExtensionDeploymentTask) => {
    let result;
    try {
      result = await task.run();
    } catch (err: any) {
      if (isRetryable(err)) {
        // Rethrow quota errors or operation already in progress so that throttler retries them.
        throw err;
      }
      errorHandler.record(
        task.spec.instanceId,
        task.type,
        err.context?.body?.error?.message ?? err,
      );
    }
    return result;
  };
}

export function createExtensionInstanceTask(
  projectId: string,
  instanceSpec: DeploymentInstanceSpec,
  validateOnly: boolean = false,
): ExtensionDeploymentTask {
  const run = async () => {
    if (instanceSpec.ref) {
      await extensionsApi.createInstance({
        projectId,
        instanceId: instanceSpec.instanceId,
        params: instanceSpec.params,
        systemParams: instanceSpec.systemParams,
        extensionVersionRef: refs.toExtensionVersionRef(instanceSpec.ref),
        allowedEventTypes: instanceSpec.allowedEventTypes,
        eventarcChannel: instanceSpec.eventarcChannel,
        validateOnly,
      });
    } else if (instanceSpec.localPath) {
      const extensionSource = await createSourceFromLocation(projectId, instanceSpec.localPath);
      await extensionsApi.createInstance({
        projectId,
        instanceId: instanceSpec.instanceId,
        params: instanceSpec.params,
        systemParams: instanceSpec.systemParams,
        extensionSource,
        allowedEventTypes: instanceSpec.allowedEventTypes,
        eventarcChannel: instanceSpec.eventarcChannel,
        validateOnly,
      });
    } else {
      throw new FirebaseError(
        `Tried to create extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`,
      );
    }
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
  instanceSpec: DeploymentInstanceSpec,
  validateOnly: boolean = false,
): ExtensionDeploymentTask {
  const run = async () => {
    if (instanceSpec.ref) {
      await extensionsApi.updateInstanceFromRegistry({
        projectId,
        instanceId: instanceSpec.instanceId,
        extRef: refs.toExtensionVersionRef(instanceSpec.ref!),
        params: instanceSpec.params,
        systemParams: instanceSpec.systemParams,
        canEmitEvents: !!instanceSpec.allowedEventTypes,
        allowedEventTypes: instanceSpec.allowedEventTypes,
        eventarcChannel: instanceSpec.eventarcChannel,
        validateOnly,
      });
    } else if (instanceSpec.localPath) {
      const extensionSource = await createSourceFromLocation(projectId, instanceSpec.localPath);
      await extensionsApi.updateInstance({
        projectId,
        instanceId: instanceSpec.instanceId,
        extensionSource,
        validateOnly,
        params: instanceSpec.params,
        systemParams: instanceSpec.systemParams,
        canEmitEvents: !!instanceSpec.allowedEventTypes,
        allowedEventTypes: instanceSpec.allowedEventTypes,
        eventarcChannel: instanceSpec.eventarcChannel,
      });
    } else {
      throw new FirebaseError(
        `Tried to update extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`,
      );
    }
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
  instanceSpec: DeploymentInstanceSpec,
  validateOnly: boolean = false,
): ExtensionDeploymentTask {
  const run = async () => {
    if (instanceSpec.ref) {
      await extensionsApi.configureInstance({
        projectId,
        instanceId: instanceSpec.instanceId,
        params: instanceSpec.params,
        systemParams: instanceSpec.systemParams,
        canEmitEvents: !!instanceSpec.allowedEventTypes,
        allowedEventTypes: instanceSpec.allowedEventTypes,
        eventarcChannel: instanceSpec.eventarcChannel,
        validateOnly,
      });
    } else if (instanceSpec.localPath) {
      // We should _always_ be updating when using local extensions, since we don't know if there was a code change at the local path since last deploy.
      throw new FirebaseError(
        `Tried to configure extension instance ${instanceSpec.instanceId} from a local path. This should never happen.`,
      );
    } else {
      throw new FirebaseError(
        `Tried to configure extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`,
      );
    }
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
  instanceSpec: InstanceSpec,
): ExtensionDeploymentTask {
  const run = async () => {
    await extensionsApi.deleteInstance(projectId, instanceSpec.instanceId);
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
  utils.logSuccess(clc.bold(clc.green("extensions")) + ` Successfully ${action} ${instanceId}`);
}
