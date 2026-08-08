import { bold } from "colorette";

import { logger } from "../../logger";
import { getEndpointFilters, endpointMatchesAnyFilter } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { flattenArray } from "../../functional";
import * as iam from "../../gcp/iam";
import * as gce from "../../gcp/computeEngine";
import * as args from "./args";
import * as backend from "./backend";
import { trackGA4 } from "../../track";
import * as utils from "../../utils";

import { getIamPolicy, setIamPolicy } from "../../gcp/resourceManager";
import { Service, serviceForEndpoint } from "./services";

const PERMISSION = "cloudfunctions.functions.setIamPolicy";
export const SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE = "roles/iam.serviceAccountTokenCreator";
export const RUN_INVOKER_ROLE = "roles/run.invoker";
export const EVENTARC_EVENT_RECEIVER_ROLE = "roles/eventarc.eventReceiver";
export const GENKIT_MONITORING_ROLES = [
  "roles/monitoring.metricWriter",
  "roles/cloudtrace.agent",
  "roles/logging.logWriter",
];

/**
 * Checks to see if the authenticated account has `iam.serviceAccounts.actAs` permissions
 * on a specified project (required for functions deployments).
 * @param projectId The project ID to check.
 */
export async function checkServiceAccountIam(projectId: string): Promise<void> {
  const saEmail = `${projectId}@appspot.gserviceaccount.com`;
  let passed = false;
  try {
    const iamResult = await iam.testResourceIamPermissions(
      "https://iam.googleapis.com",
      "v1",
      `projects/${projectId}/serviceAccounts/${saEmail}`,
      ["iam.serviceAccounts.actAs"],
    );
    passed = iamResult.passed;
  } catch (err: any) {
    logger.debug("[functions] service account IAM check errored, deploy may fail:", err);
    // we want to fail this check open and not rethrow since it's informational only
    return;
  }

  if (!passed) {
    throw new FirebaseError(
      `Missing permissions required for functions deploy. You must have permission ${bold(
        "iam.serviceAccounts.ActAs",
      )} on service account ${bold(saEmail)}.\n\n` +
        `To address this error, ask a project Owner to assign your account the "Service Account User" role from this URL:\n\n` +
        `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`,
    );
  }
}

/**
 * Checks a functions deployment for HTTP function creation, and tests IAM
 * permissions accordingly.
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
export async function checkHttpIam(
  context: args.Context,
  options: Options,
  payload: args.Payload,
): Promise<void> {
  if (!payload.functions) {
    return;
  }
  const filters = context.filters || getEndpointFilters(options, context.config!);
  const wantBackends = Object.values(payload.functions).map(({ wantBackend }) => wantBackend);
  const httpEndpoints = [...flattenArray(wantBackends.map((b) => backend.allEndpoints(b)))]
    .filter((f) => backend.isHttpsTriggered(f) || backend.isDataConnectGraphqlTriggered(f))
    .filter((f) => endpointMatchesAnyFilter(f, filters))
    // Services with platform: "run" are not GCFv1 or GCFv2 functions and are handled separately.
    // TODO: We'll need similar check for Run functions too.
    .filter((f) => f.platform !== "run");

  const existing = await backend.existingBackend(context);
  const newHttpsEndpoints = httpEndpoints.filter(backend.missingEndpoint(existing));

  if (newHttpsEndpoints.length === 0) {
    return;
  }

  logger.debug(
    "[functions] found",
    newHttpsEndpoints.length,
    "new HTTP functions, testing setIamPolicy permission...",
  );

  let passed = true;
  try {
    const iamResult = await iam.testIamPermissions(context.projectId, [PERMISSION]);
    passed = iamResult.passed;
  } catch (e: any) {
    logger.debug(
      "[functions] failed http create setIamPolicy permission check. deploy may fail:",
      e,
    );
    // fail open since this is an informational check
    return;
  }

  if (!passed) {
    void trackGA4("error", {
      error_type: "Error (User)",
      details: "deploy:functions:http_create_missing_iam",
    });
    throw new FirebaseError(
      `Missing required permission on project ${bold(
        context.projectId,
      )} to deploy new HTTPS functions. The permission ${bold(
        PERMISSION,
      )} is required to deploy the following functions:\n\n- ` +
        newHttpsEndpoints.map((func) => func.id).join("\n- ") +
        `\n\nTo address this error, please ask a project Owner to assign your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`,
    );
  }
  logger.debug("[functions] found setIamPolicy permission, proceeding with deploy");
}

/** obtain the pubsub service agent */
function getPubsubServiceAgent(projectNumber: string): string {
  return `service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
}

/** Callback reducer function */
function reduceEventsToServices(services: Array<Service>, endpoint: backend.Endpoint) {
  const service = serviceForEndpoint(endpoint);
  if (service.requiredProjectBindings && !services.find((s) => s.name === service.name)) {
    services.push(service);
  }
  return services;
}

/** Checks whether the given endpoint is a Genkit callable function. */
function isGenkitEndpoint(endpoint: backend.Endpoint): boolean {
  return (
    backend.isCallableTriggered(endpoint) && endpoint.callableTrigger.genkitAction !== undefined
  );
}

/**
 * Finds the required project level IAM bindings for the Pub/Sub service agent.
 * If the user enabled Pub/Sub on or before April 8, 2021, then we must enable the token creator role.
 * @param projectNumber project number
 * @param existingPolicy the project level IAM policy
 */
export function obtainPubSubServiceAgentBindings(projectNumber: string): iam.Binding[] {
  const serviceAccountTokenCreatorBinding: iam.Binding = {
    role: SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
    members: [`serviceAccount:${getPubsubServiceAgent(projectNumber)}`],
  };
  return [serviceAccountTokenCreatorBinding];
}

/**
 * Finds the required project level IAM bindings for service accounts used by EventArc triggers.
 * Before EventArc can invoke a function, the function's service account must be granted the invoker and event receiver roles.
 * See https://cloud.google.com/eventarc/docs/roles-permissions for more details.
 * 
 * @param projectNumber project number
 * @param want backend that we want to deploy
 */
export async function obtainEventArcServiceAccountBindings(
  projectNumber: string,
  want: backend.Backend,
): Promise<iam.Binding[]> {
  // Only v2 event-triggered functions use EventArc (not scheduled functions)
  const eventTriggeredV2Endpoints = backend.allEndpoints(want).filter((endpoint) => {
    return endpoint.platform === "gcfv2" && backend.isEventTriggered(endpoint);
  });
  
  // If no event-triggered v2 functions, return empty
  if (eventTriggeredV2Endpoints.length === 0) {
    return [];
  }
  
  // Get default service account once (it's cached internally)
  const defaultServiceAccount = await gce.getDefaultServiceAccount(projectNumber);
  
  // Collect all unique service accounts
  const serviceAccounts = new Set<string>();
  for (const endpoint of eventTriggeredV2Endpoints) {
    const sa = endpoint.serviceAccount || defaultServiceAccount;
    serviceAccounts.add(sa);
  }
  
  // Create bindings for all service accounts
  const members = Array.from(serviceAccounts).map(sa => `serviceAccount:${sa}`);
  return [
    {
      role: RUN_INVOKER_ROLE,
      members: members,
    },
    {
      role: EVENTARC_EVENT_RECEIVER_ROLE,
      members: members,
    },
  ];
}

/**
 * Checks and sets the roles for any genkit deployed functions that are required
 * for Firebase Genkit Monitoring.
 * @param projectId human readable project id
 * @param projectNumber project number
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
export async function ensureGenkitMonitoringRoles(
  projectId: string,
  projectNumber: string,
  want: backend.Backend,
  have: backend.Backend,
  dryRun?: boolean,
): Promise<void> {
  const wantEndpoints = backend.allEndpoints(want).filter(isGenkitEndpoint);
  const newEndpoints = wantEndpoints.filter(backend.missingEndpoint(have));

  if (newEndpoints.length === 0) {
    return;
  }

  const serviceAccounts = newEndpoints
    .map((endpoint) => endpoint.serviceAccount || "")
    .filter((value, index, self) => self.indexOf(value) === index);
  const defaultServiceAccountIndex = serviceAccounts.indexOf("");
  if (defaultServiceAccountIndex !== -1) {
    serviceAccounts[defaultServiceAccountIndex] = await gce.getDefaultServiceAccount(projectNumber);
  }

  const members = serviceAccounts.filter((sa) => !!sa).map((sa) => `serviceAccount:${sa}`);
  const requiredBindings: iam.Binding[] = [];
  for (const monitoringRole of GENKIT_MONITORING_ROLES) {
    requiredBindings.push({
      role: monitoringRole,
      members: members,
    });
  }
  await ensureBindings(
    projectId,
    projectNumber,
    requiredBindings,
    newEndpoints.map((endpoint) => endpoint.id),
    dryRun,
  );
}

/**
 * Checks and sets the roles for specific resource service agents
 * @param projectId human readable project id
 * @param projectNumber project number
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
export async function ensureServiceAgentRoles(
  projectId: string,
  projectNumber: string,
  want: backend.Backend,
  have: backend.Backend,
  dryRun?: boolean,
): Promise<void> {
  // find new services
  const wantServices = backend.allEndpoints(want).reduce(reduceEventsToServices, []);
  const haveServices = backend.allEndpoints(have).reduce(reduceEventsToServices, []);
  const newServices = wantServices.filter(
    (wantS) => !haveServices.find((haveS) => wantS.name === haveS.name),
  );
  if (newServices.length === 0) {
    return;
  }

  // obtain all the bindings we need to have active in the project
  const requiredBindingsPromises: Array<Promise<Array<iam.Binding>>> = [];
  for (const service of newServices) {
    requiredBindingsPromises.push(service.requiredProjectBindings!(projectNumber));
  }
  const nestedRequiredBindings = await Promise.all(requiredBindingsPromises);
  const requiredBindings = [...flattenArray(nestedRequiredBindings)];
  if (haveServices.length === 0) {
    requiredBindings.push(...obtainPubSubServiceAgentBindings(projectNumber));
    requiredBindings.push(...(await obtainEventArcServiceAccountBindings(projectNumber, want)));
  }
  if (requiredBindings.length === 0) {
    return;
  }
  await ensureBindings(
    projectId,
    projectNumber,
    requiredBindings,
    newServices.map((service) => service.api),
    dryRun,
  );
}

async function ensureBindings(
  projectId: string,
  projectNumber: string,
  requiredBindings: iam.Binding[],
  newServicesOrEndpoints: string[],
  dryRun?: boolean,
): Promise<void> {
  // get the full project iam policy
  let policy: iam.Policy;
  try {
    policy = await getIamPolicy(projectNumber);
  } catch (err: any) {
    iam.printManualIamConfig(requiredBindings, projectId, "functions");
    utils.logLabeledBullet(
      "functions",
      "Could not verify the necessary IAM configuration for the following newly-integrated services: " +
        `${newServicesOrEndpoints.join(", ")}` +
        ". Deployment may fail.",
      "warn",
    );
    return;
  }
  const hasUpdatedBindings = iam.mergeBindings(policy, requiredBindings);
  if (!hasUpdatedBindings) {
    return;
  }

  // set the updated policy
  try {
    if (dryRun) {
      logger.info(
        `On your next deploy, the following required roles will be granted: ${requiredBindings.map(
          (b) => `${b.members.join(", ")}: ${bold(b.role)}`,
        )}`,
      );
    } else {
      await setIamPolicy(projectNumber, policy, "bindings");
    }
  } catch (err: any) {
    iam.printManualIamConfig(requiredBindings, projectId, "functions");
    throw new FirebaseError(
      "We failed to modify the IAM policy for the project. The functions " +
        "deployment requires specific roles to be granted to service agents," +
        " otherwise the deployment will fail.",
      { original: err },
    );
  }
}
