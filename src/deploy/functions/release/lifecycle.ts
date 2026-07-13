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

export type DeploymentEvent = "afterFirstDeploy" | "afterRedeploy";

/**
 * Determines whether the current deployment represents a fresh codebase deployment
 * (afterFirstDeploy) or an update to an existing deployment (afterRedeploy).
 */
export function determineDeploymentEvent(haveBackend: backend.Backend): DeploymentEvent {
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
 * Detects if this deployment is a redeploy of a partially successful but identical previous deployment.
 * This will be true only if the hashes for both backends are the same but the specified endpoints are different.
 * Note: If any code or comment modification was made between deploys, the hash will change, so this check won't detect it as an identical recovery deployment.
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

  // 1. We know a previous deploy was a partial success if haveBackend includes the same hash
  // but wantBackend includes different functions.
  const hasSameHash = haveEndpoints.some((ep) => ep.hash && wantHashes.has(ep.hash));
  if (!hasSameHash) {
    return false;
  }

  // 2. If we have existing endpoints in haveBackend with matching hashes, but wantBackend contains net new functions,
  // we know the current deployment is re-attempting a previous deployment with the same source code specification
  // that failed to deploy all endpoints successfully.
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

  let event: DeploymentEvent | undefined;
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
    event = determineDeploymentEvent(haveBackend);
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
  event: DeploymentEvent,
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
