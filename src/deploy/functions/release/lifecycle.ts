import * as backend from "../backend";
import * as planner from "./planner";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning } from "../../../utils";
import * as cloudtasks from "../../../gcp/cloudtasks";
import * as computeEngine from "../../../gcp/computeEngine";
import { getProject } from "../../../management/projects";
import { assertExhaustive } from "../../../functional";
import { Options } from "../../../options";
import * as prompts from "../prompts";

/**
 * Determines whether the current deployment represents a fresh codebase deployment
 * (afterFirstDeploy) or an update to an existing deployment (afterRedeploy).
 */
export function determineLifecycleEvent(haveBackend: backend.Backend): backend.LifecycleEvent {
  // If haveBackend has no existing active endpoints, this is a fresh installation.
  const hasExistingEndpoints = backend.someEndpoint(haveBackend, (ep) => ep.state !== "FAILED");
  if (!hasExistingEndpoints) {
    return "afterFirstDeploy";
  }
  return "afterRedeploy";
}

/**
 * Checks if the backend specification has any lifecycle hooks configured.
 */
export function hasLifecycleHooks(backendSpec: backend.Backend): boolean {
  return !!(backendSpec.lifecycleHooks && Object.keys(backendSpec.lifecycleHooks).length > 0);
}

/**
 * Detects if the current deployment is recovering/completing a previous partial deployment
 * of the same version, and is in a state where we cannot automatically determine the
 * correct lifecycle event (prompting the user is required).
 *
 * This occurs when:
 * 1. Some functions already match the target version hash (indicating a previous partial success).
 * 2. Some functions in the target state are NOT active (missing or failed), meaning the codebase
 *    has never been fully deployed at this version (or at all).
 *
 * We do NOT consider it a recovery deployment if all functions are already active (even if on
 * older versions), because in that case we can safely infer that this is a redeployment
 * and automatically run `afterRedeploy` once successful.
 */
export function isRecoveryDeployment(
  wantBackend: backend.Backend,
  haveBackend: backend.Backend,
): boolean {
  const wantEndpoints = backend.allEndpoints(wantBackend);
  const haveEndpoints = backend.allEndpoints(haveBackend);

  const wantHashes = new Set(wantEndpoints.map((ep) => ep.hash).filter((h): h is string => !!h));
  if (!wantHashes.size) {
    // If there are no endpoint hashes in wantBackend (e.g. deleting all functions or missing hashes),
    // we cannot reliably compare hashes to detect recovery, so we return false.
    return false;
  }

  // 1. Verify that at least one function in production already matches the target version hash.
  // If none match, this is either a completely new deployment or a clean update, so it's not a recovery.
  const hasSameHash = haveEndpoints.some((ep) => ep.hash && wantHashes.has(ep.hash));
  if (!hasSameHash) {
    return false;
  }

  // 2. Check if there are any target functions that are NOT currently active in production.
  // If there are inactive/failed functions, the deployment is incomplete and ambiguous (could be
  // recovering a first-time deploy), so we must prompt the user.
  const hasNetNewFunctions = wantEndpoints.some(
    (wantEp) =>
      !backend.findEndpoint(
        haveBackend,
        (haveEp) =>
          haveEp.id === wantEp.id && haveEp.region === wantEp.region && haveEp.state !== "FAILED",
      ),
  );

  return hasNetNewFunctions;
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
  options?: Options,
): Promise<boolean> {
  if (!hasLifecycleHooks(wantBackend)) {
    return false;
  }

  const codebasePlan = plan && codebase ? plan[codebase] : undefined;
  if (codebasePlan && codebase) {
    const allWantEndpoints = backend.allEndpoints(wantBackend);
    const isFiltered = allWantEndpoints.some(backend.missingEndpoint(codebasePlan.plannedBackend));

    if (isFiltered) {
      const event = determineLifecycleEvent(haveBackend);
      logLabeledWarning(
        "functions",
        `Lifecycle hook "${event}" for codebase "${codebase}" was configured but not executed because this was a partial deployment (filtered).`,
      );
      logLabeledBullet(
        "functions",
        `You can run the lifecycle hook in isolation by running: firebase functions:lifecycle:run ${event} ${codebase}`,
      );
      return false;
    }
  }

  let event: backend.LifecycleEvent | undefined;
  if (isRecoveryDeployment(wantBackend, haveBackend)) {
    event = await prompts.promptForLifecycleEvent(codebase ?? "default", wantBackend, options);
    if (!event) {
      logLabeledBullet(
        "functions",
        `Skipping lifecycle hooks for codebase "${codebase ?? "default"}".`,
      );
      return false;
    }
  } else {
    event = determineLifecycleEvent(haveBackend);
  }

  const hooks = wantBackend.lifecycleHooks || {};
  const hook = hooks[event];

  if (!hook) {
    logger.debug(`No lifecycle hook configured for event: ${event}`);
    return false;
  }

  if (event === "afterRedeploy" && plan) {
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
        `No resources modified for codebase: ${codebase ?? "default"}. Skipping afterRedeploy lifecycle hook.`,
      );
      return false;
    }
  }

  try {
    await executeHook(event, hook, wantBackend);
    return true;
  } catch (err: unknown) {
    // We treat lifecycle hook failures as warnings. We don't want to fail
    // the entire deploy command if a post-deploy hook fails to enqueue.
    const errorMsg = err instanceof Error ? err.message : String(err);
    logLabeledWarning("functions", `Failed to execute ${event} lifecycle hook: ${errorMsg}`);
    logLabeledBullet(
      "functions",
      `You can retry the lifecycle hook in isolation by running: firebase functions:lifecycle:run ${event} ${codebase ?? "default"}`,
    );
    return false;
  }
}

/**
 * Executes a taskQueue lifecycle hook by enqueuing a task in Cloud Tasks.
 */
async function executeTaskQueueHook(
  taskHook: { function: string; body?: Record<string, unknown> },
  wantBackend: backend.Backend,
): Promise<backend.Endpoint> {
  const targetEndpoint = backend.findEndpoint(wantBackend, (ep) => ep.id === taskHook.function);
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

  await cloudtasks.enqueueTask(queueName, task);
  logLabeledSuccess(
    "functions",
    `Successfully queued task for lifecycle hook ${taskHook.function} in queue ${queueName}.`,
  );
  return targetEndpoint;
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

/**
 * Executes a specific lifecycle hook in isolation.
 */
export async function executeHook(
  event: backend.LifecycleEvent,
  hook: backend.LifecycleHook,
  backendSpec: backend.Backend,
): Promise<backend.Endpoint | undefined> {
  let executedEndpoint: backend.Endpoint | undefined;
  if ("task" in hook) {
    logLabeledBullet(
      "functions",
      `Executing ${event} lifecycle hook targeting: ${hook.task.function}...`,
    );
    executedEndpoint = await executeTaskQueueHook(hook.task, backendSpec);
  } else if ("call" in hook) {
    throw new FirebaseError(`Lifecycle hook action type "call" is not supported.`);
  } else if ("http" in hook) {
    throw new FirebaseError(`Lifecycle hook action type "http" is not supported.`);
  } else {
    assertExhaustive(hook);
  }

  if (executedEndpoint) {
    logLabeledBullet(
      "functions",
      `View logs for ${event} at: ${getCloudConsoleLogUrl(executedEndpoint)}`,
    );
  }
  return executedEndpoint;
}
