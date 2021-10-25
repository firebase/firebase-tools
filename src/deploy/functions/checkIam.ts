import { bold } from "cli-color";

import { logger } from "../../logger";
import { getFilterGroups, functionMatchesAnyGroup } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { testIamPermissions, testResourceIamPermissions } from "../../gcp/iam";
import * as args from "./args";
import * as backend from "./backend";
import * as track from "../../track";
import { Options } from "../../options";
import * as storage from "../../gcp/storage";
import { getIamPolicy, setIamPolicy } from "../../gcp/resourceManager";
import { EventShorthand, EventType, EVENT_SHORTHAND_MAPPING } from "./types";

const noop = (): Promise<void> => Promise.resolve();

const PERMISSIONS_LOOKUP: Record<EventShorthand, (projectId: string) => Promise<void>> = {
  pubsub: noop,
  storage: enableStorageRoles,
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

/** Callback function to find all v2 event types in shorthand form */
function reduceEventsV2(filtered: Set<EventShorthand>, option: backend.Endpoint) {
  if (
    option.platform === "gcfv2" &&
    backend.isEventTriggered(option) &&
    EVENT_SHORTHAND_MAPPING[option.eventTrigger.eventType as EventType]
  ) {
    filtered.add(EVENT_SHORTHAND_MAPPING[option.eventTrigger.eventType as EventType]);
  }
  return filtered;
}

/**
 * Checks and sets the roles for specific resource service agents
 * @param projectId project identifier
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
export async function checkServiceAgentRoles(
  projectId: string,
  want: backend.Backend,
  have: backend.Backend
) {
  // find all new v2 events
  const wantEvents = backend.allEndpoints(want).reduce(reduceEventsV2, new Set<EventShorthand>());
  const haveEvents = backend.allEndpoints(have).reduce(reduceEventsV2, new Set<EventShorthand>());
  const events = [...wantEvents].filter((event) => !haveEvents.has(event));
  // set permissions for the v2 events
  const enablePermissions: Array<Promise<void>> = [];
  for (const event of events) {
    const permissionsFn = PERMISSIONS_LOOKUP[event];
    if (!permissionsFn) {
      logger.debug("Cannot find the correct permissions setting function for ", event, " events.");
      continue;
    }
    enablePermissions.push(permissionsFn(projectId));
  }
  // Since we're modifying the entire IAM policy, might need await these individually
  await Promise.all(enablePermissions);
}

/** Response type for obtaining the storage service agent */
interface StorageServiceAccountResponse {
  email_address: string;
  kind: string;
}

/**
 * Helper function that grants the Cloud Storage service agent a role to access EventArc triggers
 * @param projectId project identifier
 */
export async function enableStorageRoles(projectId: string): Promise<void> {
  const storageResponse = (await storage.getServiceAccount(
    projectId
  )) as StorageServiceAccountResponse;
  if (!storageResponse || !storageResponse.email_address) {
    throw new FirebaseError("Failed to obtain the Cloud Storage service agent email address");
  }
  const storageServiceAgent = `serviceAccount:${storageResponse.email_address}`;
  const policy = await getIamPolicy(projectId);
  if (!policy) {
    throw new FirebaseError("Failed to obtain the IAM policy");
  }
  // find the pubsub binding
  let pubsubBinding = policy.bindings.find((b) => b.role === PUBSUB_PUBLISHER_ROLE);
  if (!pubsubBinding) {
    pubsubBinding = {
      role: PUBSUB_PUBLISHER_ROLE,
      members: [],
    };
    policy.bindings.push(pubsubBinding);
  }
  if (!pubsubBinding.members.find((m) => m === storageServiceAgent)) {
    pubsubBinding.members.push(storageServiceAgent);
    const newPolicy = await setIamPolicy(projectId, policy, "bindings");
    if (JSON.stringify(policy) !== JSON.stringify(newPolicy)) {
      throw new FirebaseError("IAM policies do not match after Cloud Storage service agent update");
    }
  }
}
