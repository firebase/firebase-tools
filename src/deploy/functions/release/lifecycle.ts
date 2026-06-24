import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import * as cloudtasks from "../../../gcp/cloudtasks";

export type LifecycleDelta = "afterInstall" | "afterUpdate";

/**
 * Determines whether the current deployment represents a fresh codebase deployment
 * (afterInstall) or an update to an existing deployment (afterUpdate).
 */
export function determineDeploymentDelta(
  wantBackend: backend.Backend,
  haveBackend: backend.Backend,
): LifecycleDelta {
  // If haveBackend has no existing endpoints, this is a fresh installation.
  const hasExistingEndpoints = backend.someEndpoint(haveBackend, () => true);
  if (!hasExistingEndpoints) {
    return "afterInstall";
  }
  return "afterUpdate";
}

/**
 * Validates and executes matching lifecycle hooks for the deployed codebase.
 * Returns true if a hook was executed, false otherwise.
 */
export async function executeLifecycleHooks(
  wantBackend: backend.Backend,
  haveBackend: backend.Backend,
): Promise<boolean> {
  const delta = determineDeploymentDelta(wantBackend, haveBackend);
  const hooks = wantBackend.lifecycleHooks || {};
  const hook = hooks[delta];

  if (!hook) {
    logger.debug(`No lifecycle hook configured for event: ${delta}`);
    return false;
  }

  logger.info(`Executing ${delta} lifecycle hook targeting: ${hook.target}...`);

  if (hook.actionType === "taskQueue") {
    await executeTaskQueueHook(hook, wantBackend);
    return true;
  }

  // Prototype currently supports taskQueue actionType.
  logger.info(`Skipping hook execution for unsupported actionType: ${hook.actionType}`);
  return false;
}

/**
 * Executes a taskQueue lifecycle hook by enqueuing a task in Cloud Tasks.
 */
async function executeTaskQueueHook(
  hook: backend.LifecycleHook,
  wantBackend: backend.Backend,
): Promise<void> {
  const targetEndpoint = findTargetEndpoint(wantBackend, hook.target);
  if (!targetEndpoint) {
    throw new FirebaseError(`Target endpoint "${hook.target}" not found in backend for lifecycle hook.`);
  }

  if (!backend.isTaskQueueTriggered(targetEndpoint)) {
    throw new FirebaseError(`Target endpoint "${hook.target}" is not a task queue function.`);
  }

  const queueName = cloudtasks.queueNameForEndpoint(targetEndpoint);
  const bodyStr = hook.body ? JSON.stringify(hook.body) : "";
  const body = bodyStr ? Buffer.from(bodyStr).toString("base64") : undefined;

  const url = targetEndpoint.uri;
  if (!url) {
    throw new FirebaseError(`Target endpoint "${hook.target}" does not have a trigger URI.`);
  }

  const task: cloudtasks.Task = {
    httpRequest: {
      url,
      httpMethod: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  };
  if (body) {
    task.httpRequest.body = body;
  }

  try {
    await cloudtasks.enqueueTask(queueName, task);
    logger.info(`Successfully queued task for lifecycle hook ${hook.target} in queue ${queueName}.`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to enqueue task for lifecycle hook ${hook.target}: ${errorMsg}`);
    // Hooks follow idempotent execution contract: log warning but do not fail deploy.
  }
}

function findTargetEndpoint(
  backendSpec: backend.Backend,
  targetId: string,
): backend.Endpoint | undefined {
  for (const endpoint of backend.allEndpoints(backendSpec)) {
    if (endpoint.id === targetId) {
      return endpoint;
    }
  }
  return undefined;
}
