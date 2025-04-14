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
 *
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
  const filters = context.filters || getEndpointFilters(options);
  const wantBackends = Object.values(payload.functions).map(({ wantBackend }) => wantBackend);
  const httpEndpoints = [...flattenArray(wantBackends.map((b) => backend.allEndpoints(b)))]
    .filter(backend.isHttpsTriggered)
    .filter((f) => endpointMatchesAnyFilter(f, filters));

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
 * Finds the required project level IAM bindings for the default compute service agent.
 * Before a user creates an EventArc trigger, this agent must be granted the invoker and event receiver roles.
 * @param projectNumber project number
 * @param existingPolicy the project level IAM policy
 */
export function obtainDefaultComputeServiceAgentBindings(projectNumber: string): iam.Binding[] {
  const defaultComputeServiceAgent = `serviceAccount:${gce.getDefaultServiceAccount(projectNumber)}`;
  const runInvokerBinding: iam.Binding = {
    role: RUN_INVOKER_ROLE,
    members: [defaultComputeServiceAgent],
  };
  const eventarcEventReceiverBinding: iam.Binding = {
    role: EVENTARC_EVENT_RECEIVER_ROLE,
    members: [defaultComputeServiceAgent],
  };
  return [runInvokerBinding, eventarcEventReceiverBinding];
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
    requiredBindings.push(...obtainDefaultComputeServiceAgentBindings(projectNumber));
  }
  if (requiredBindings.length === 0) {
    return;
  }

  // get the full project iam policy
  let policy: iam.Policy;
  try {
    policy = await getIamPolicy(projectNumber);
  } catch (err: any) {
    iam.printManualIamConfig(requiredBindings, projectId, "functions");
    utils.logLabeledBullet(
      "functions",
      "Could not verify the necessary IAM configuration for the following newly-integrated services: " +
        `${newServices.map((service) => service.api).join(", ")}` +
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
