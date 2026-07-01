import * as backend from "../backend";
import * as planner from "./planner";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning } from "../../../utils";
import * as cloudtasks from "../../../gcp/cloudtasks";
import * as computeEngine from "../../../gcp/computeEngine";
import { getProject } from "../../../management/projects";
import { assertExhaustive } from "../../../functional";

export type LifecycleDelta = "afterInstall" | "afterUpdate";

/**
 * Determines whether the current deployment represents a fresh codebase deployment
 * (afterInstall) or an update to an existing deployment (afterUpdate).
 */
export function determineDeploymentDelta(haveBackend: backend.Backend): LifecycleDelta {
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
  const delta = determineDeploymentDelta(haveBackend);
  const hooks = wantBackend.lifecycleHooks || {};
  const hook = hooks[delta];

  if (!hook) {
    logger.debug(`No lifecycle hook configured for event: ${delta}`);
    return false;
  }

  if (delta === "afterUpdate" && plan) {
    const codebasePlans = codebase ? [plan[codebase]].filter(Boolean) : Object.values(plan);
    const hasResourceModifications = codebasePlans.some((codebasePlan) =>
      Object.values(codebasePlan.regionalChangesets).some(
        (changeset) =>
          changeset.endpointsToCreate.length > 0 ||
          changeset.endpointsToUpdate.length > 0 ||
          changeset.endpointsToDelete.length > 0,
      ),
    );
    if (!hasResourceModifications) {
      logLabeledBullet(
        "functions",
        "No resources modified in codebase. Skipping afterUpdate lifecycle hook.",
      );
      return false;
    }
  }

  if ("task" in hook) {
    logLabeledBullet(
      "functions",
      `Executing ${delta} lifecycle hook targeting: ${hook.task.function}...`,
    );
    await executeTaskQueueHook(hook.task, wantBackend);
    return true;
  } else if ("call" in hook) {
    throw new FirebaseError(`Lifecycle hook action type "call" is not supported.`);
  } else if ("http" in hook) {
    throw new FirebaseError(`Lifecycle hook action type "http" is not supported.`);
  } else {
    assertExhaustive(hook);
  }
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

  const projectMetadata = await getProject(targetEndpoint.project);
  const projectNumber = projectMetadata.projectNumber;
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
        audience: url,
      },
    },
  };
  if (body) {
    task.httpRequest.body = body;
  }

  try {
    await cloudtasks.enqueueTask(queueName, task);
    logLabeledSuccess(
      "functions",
      `Successfully queued task for lifecycle hook ${taskHook.function} in queue ${queueName}.`,
    );
    logLabeledBullet(
      "functions",
      `View logs for ${taskHook.function} at: ${getCloudConsoleLogUrl(targetEndpoint)}`,
    );
  } catch (err: unknown) {
    // We treat lifecycle hook failures as warnings. We don't want to fail
    // the entire deploy command if a post-deploy hook fails to enqueue.
    const errorMsg = err instanceof Error ? err.message : String(err);
    logLabeledWarning(
      "functions",
      `Failed to enqueue task for lifecycle hook ${taskHook.function}: ${errorMsg}`,
    );
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
