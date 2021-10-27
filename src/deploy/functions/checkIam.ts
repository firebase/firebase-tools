import { bold } from "cli-color";

import { logger } from "../../logger";
import { getFilterGroups, functionMatchesAnyGroup } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { Policy, testIamPermissions, testResourceIamPermissions } from "../../gcp/iam";
import * as args from "./args";
import * as backend from "./backend";
import * as track from "../../track";
import { Options } from "../../options";
import * as storage from "../../gcp/storage";
import { getIamPolicy, setIamPolicy } from "../../gcp/resourceManager";
import { Service, EVENT_V2_SERVICE_MAPPING } from "./eventTypes";

const noop = (): Promise<void> => Promise.resolve();

const ROLES_LOOKUP: Record<Service, (projectId: string) => Promise<void>> = {
  pubsub: noop,
  storage: ensureStorageRoles,
};

const PUBSUB_PUBLISHER_ROLE = "roles/pubsub.publisher";

const PERMISSION = "cloudfunctions.functions.setIamPolicy";

/**
 * Checks to see if the authenticated account has `iam.serviceAccounts.actAs` permissions
 * on a specified project (required for functions deployments).
 * @param projectId The project ID to check.
 */
export async function checkServiceAccountIam(projectId: string): Promise<void> {
  const saEmail = `${projectId}@appspot.gserviceaccount.com`;
  let passed = false;
  try {
    const iamResult = await testResourceIamPermissions(
      "https://iam.googleapis.com",
      "v1",
      `projects/${projectId}/serviceAccounts/${saEmail}`,
      ["iam.serviceAccounts.actAs"]
    );
    passed = iamResult.passed;
  } catch (err) {
    logger.debug("[functions] service account IAM check errored, deploy may fail:", err);
    // we want to fail this check open and not rethrow since it's informational only
    return;
  }

  if (!passed) {
    throw new FirebaseError(
      `Missing permissions required for functions deploy. You must have permission ${bold(
        "iam.serviceAccounts.ActAs"
      )} on service account ${bold(saEmail)}.\n\n` +
        `To address this error, ask a project Owner to assign your account the "Service Account User" role from this URL:\n\n` +
        `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`
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
  payload: args.Payload
): Promise<void> {
  const filterGroups = context.filters || getFilterGroups(options);

  const httpEndpoints = backend
    .allEndpoints(payload.functions!.backend)
    .filter(backend.isHttpsTriggered)
    .filter((f) => functionMatchesAnyGroup(f, filterGroups));

  const existing = await backend.existingBackend(context);
  const newHttpsEndpoints = httpEndpoints.filter(backend.missingEndpoint(existing));

  if (newHttpsEndpoints.length === 0) {
    return;
  }

  logger.debug(
    "[functions] found",
    newHttpsEndpoints.length,
    "new HTTP functions, testing setIamPolicy permission..."
  );

  let passed = true;
  try {
    const iamResult = await testIamPermissions(context.projectId, [PERMISSION]);
    passed = iamResult.passed;
  } catch (e) {
    logger.debug(
      "[functions] failed http create setIamPolicy permission check. deploy may fail:",
      e
    );
    // fail open since this is an informational check
    return;
  }

  if (!passed) {
    track("Error (User)", "deploy:functions:http_create_missing_iam");
    throw new FirebaseError(
      `Missing required permission on project ${bold(
        context.projectId
      )} to deploy new HTTPS functions. The permission ${bold(
        PERMISSION
      )} is required to deploy the following functions:\n\n- ` +
        newHttpsEndpoints.map((func) => func.id).join("\n- ") +
        `\n\nTo address this error, please ask a project Owner to assign your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`
    );
  }
  logger.debug("[functions] found setIamPolicy permission, proceeding with deploy");
}

/** Callback function to find all v2 service types in from events */
function reduceEventsToServicesV2(filtered: Set<Service>, option: backend.Endpoint) {
  if (
    option.platform === "gcfv2" &&
    backend.isEventTriggered(option) &&
    EVENT_V2_SERVICE_MAPPING[option.eventTrigger.eventType]
  ) {
    filtered.add(EVENT_V2_SERVICE_MAPPING[option.eventTrigger.eventType]);
  }
  return filtered;
}

/**
 * Checks and sets the roles for specific resource service agents
 * @param projectId project identifier
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
export async function ensureServiceAgentRoles(
  projectId: string,
  want: backend.Backend,
  have: backend.Backend
) {
  // find all new v2 events
  const wantServices = backend
    .allEndpoints(want)
    .reduce(reduceEventsToServicesV2, new Set<Service>());
  const haveServices = backend
    .allEndpoints(have)
    .reduce(reduceEventsToServicesV2, new Set<Service>());
  const newServices = [...wantServices].filter((event) => !haveServices.has(event));
  // set permissions for the v2 events
  const ensureCorrectRoles: Array<Promise<void>> = [];
  for (const service of newServices) {
    const rolesFn = ROLES_LOOKUP[service];
    if (!rolesFn) {
      logger.debug(
        "Cannot find the correct function mapping that grants roles for ",
        service,
        " service."
      );
      continue;
    }
    ensureCorrectRoles.push(rolesFn(projectId));
  }
  // TODO(colerogers): When we add another service to enable, check if we also call setIamPolicy,
  // and update this to await individually, otherwise leave as is
  await Promise.all(ensureCorrectRoles);
}

/**
 * Helper function that grants the Cloud Storage service agent a role to access EventArc triggers
 * @param projectId project identifier
 */
export async function ensureStorageRoles(projectId: string): Promise<void> {
  let policy: Policy;
  try {
    policy = await getIamPolicy(projectId);
  } catch (err) {
    logger.warn(
      "We failed to obtain the IAM policy for the project,",
      " the storage function deployment might fail if storage service ",
      "account doesn't have the pubsub.publisher role."
    );
    return;
  }
  const storageResponse = await storage.getServiceAccount(projectId);
  const storageServiceAgent = `serviceAccount:${storageResponse.email_address}`;
  let pubsubBinding = policy.bindings.find((b) => b.role === PUBSUB_PUBLISHER_ROLE);
  if (pubsubBinding && pubsubBinding.members.find((m) => m === storageServiceAgent)) {
    return; // already have correct role bindings
  }
  if (!pubsubBinding) {
    pubsubBinding = {
      role: PUBSUB_PUBLISHER_ROLE,
      members: [],
    };
    policy.bindings.push(pubsubBinding);
  }
  pubsubBinding.members.push(storageServiceAgent); // add service agent to role
  try {
    const newPolicy = await setIamPolicy(projectId, policy, "bindings");
    if (
      !newPolicy.bindings.find(
        (b) => b.role === PUBSUB_PUBLISHER_ROLE && b.members.find((m) => m === storageServiceAgent)
      )
    ) {
      throw new Error(
        `Could not find the storage service agent under the pubsub role binding in the updated policy.`
      );
    }
  } catch (err) {
    logger.error();
    throw new FirebaseError(
      `Failed to grant ${storageResponse.email_address} the ${PUBSUB_PUBLISHER_ROLE} permission. ` +
        "This is necessary to receive Cloud Storage events.",
      { original: err }
    );
  }
}
