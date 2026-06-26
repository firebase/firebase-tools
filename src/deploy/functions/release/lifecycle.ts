import * as backend from "../backend";
import * as planner from "./planner";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import * as cloudtasks from "../../../gcp/cloudtasks";
import * as computeEngine from "../../../gcp/computeEngine";
import { getProjectNumber } from "../../../getProjectNumber";

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
  plan?: planner.DeploymentPlan,
  codebase?: string,
): Promise<boolean> {
  const delta = determineDeploymentDelta(wantBackend, haveBackend);
  const hooks = wantBackend.lifecycleHooks || {};
  const hook = hooks[delta];

  if (!hook) {
    logger.debug(`No lifecycle hook configured for event: ${delta}`);
    return false;
  }

  if (delta === "afterUpdate" && plan) {
    const relevantChangesets = Object.entries(plan)
      .filter(([key]) => !codebase || key.startsWith(`${codebase}-`))
      .map(([, c]) => c);
    const hasResourceModifications = relevantChangesets.some(
      (changeset) =>
        changeset.endpointsToCreate.length > 0 ||
        changeset.endpointsToUpdate.length > 0 ||
        changeset.endpointsToDelete.length > 0,
    );
    if (!hasResourceModifications) {
      logger.info("No resources modified in codebase. Skipping afterUpdate lifecycle hook.");
      return false;
    }
  }

  if (hook.task) {
    logger.info(`Executing ${delta} lifecycle hook targeting: ${hook.task.function}...`);
    await executeTaskQueueHook(hook.task, wantBackend);
    return true;
  }

  if (hook.callable) {
    logger.info(`Skipping hook execution for unsupported actionType: callable`);
    return false;
  }

  if (hook.http) {
    logger.info(`Skipping hook execution for unsupported actionType: http`);
    return false;
  }

  logger.info(`No action specified for lifecycle hook`);
  return false;
}

/**
 * Executes a taskQueue lifecycle hook by enqueuing a task in Cloud Tasks.
 */
async function executeTaskQueueHook(
  taskHook: { function: string; body?: Record<string, unknown> },
  wantBackend: backend.Backend,
): Promise<void> {
  const targetEndpoint = findTargetEndpoint(wantBackend, taskHook.function);
  if (!targetEndpoint) {
    throw new FirebaseError(
      `Target endpoint "${taskHook.function}" not found in backend for lifecycle hook.`,
    );
  }

  if (!backend.isTaskQueueTriggered(targetEndpoint)) {
    throw new FirebaseError(`Target endpoint "${taskHook.function}" is not a task queue function.`);
  }

  const queueName = cloudtasks.queueNameForEndpoint(targetEndpoint);
  const bodyStr = taskHook.body ? JSON.stringify(taskHook.body) : "";
  const body = bodyStr ? Buffer.from(bodyStr).toString("base64") : undefined;

  const url = targetEndpoint.uri;
  if (!url) {
    throw new FirebaseError(`Target endpoint "${taskHook.function}" does not have a trigger URI.`);
  }

  const projectNumber = await getProjectNumber({ projectId: targetEndpoint.project });
  const sa =
    targetEndpoint.serviceAccount || (await computeEngine.getDefaultServiceAccount(projectNumber));

  const task: cloudtasks.Task = {
    httpRequest: {
      url,
      httpMethod: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      oidcToken: {
        serviceAccountEmail: sa,
      },
    },
  };
  if (body) {
    task.httpRequest.body = body;
  }

  try {
    await cloudtasks.enqueueTask(queueName, task);
    logger.info(
      `Successfully queued task for lifecycle hook ${taskHook.function} in queue ${queueName}.`,
    );
    logger.info(`View logs for ${taskHook.function} at: ${getCloudConsoleLogUrl(targetEndpoint)}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to enqueue task for lifecycle hook ${taskHook.function}: ${errorMsg}`);
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

/**
 * Generates the Google Cloud Console log URL for the given endpoint.
 */
function getCloudConsoleLogUrl(endpoint: backend.Endpoint): string {
  const { project, region, id } = endpoint;
  const serviceName = endpoint.runServiceId || id;
  const query = `resource.type="cloud_run_revision"\nresource.labels.service_name="${serviceName}"\nresource.labels.location="${region}"`;
  return `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(query)};project=${project}`;
}
