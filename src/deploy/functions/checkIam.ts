import { bold } from "cli-color";

import { logger } from "../../logger";
import { getFilterGroups, functionMatchesAnyGroup } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import * as iam from "../../gcp/iam";
import * as args from "./args";
import * as backend from "./backend";
import * as track from "../../track";
import * as utils from "../../utils";
import { Options } from "../../options";

import { getIamPolicy, setIamPolicy } from "../../gcp/resourceManager";
import { Service, serviceForEndpoint } from "./services";

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
    const iamResult = await iam.testResourceIamPermissions(
      "https://iam.googleapis.com",
      "v1",
      `projects/${projectId}/serviceAccounts/${saEmail}`,
      ["iam.serviceAccounts.actAs"]
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
    const iamResult = await iam.testIamPermissions(context.projectId, [PERMISSION]);
    passed = iamResult.passed;
  } catch (e: any) {
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

/** Callback reducer function */
function reduceEventsToServices(services: Array<Service>, endpoint: backend.Endpoint) {
  const service = serviceForEndpoint(endpoint);
  if (service.requiredProjectBindings && !services.find((s) => s.name === service.name)) {
    services.push(service);
  }
  return services;
}

/** Helper to merge all required bindings into the IAM policy */
export function mergeBindings(policy: iam.Policy, allRequiredBindings: iam.Binding[][]) {
  for (const requiredBindings of allRequiredBindings) {
    if (requiredBindings.length === 0) {
      continue;
    }
    for (const requiredBinding of requiredBindings) {
      const ndx = policy.bindings.findIndex(
        (policyBinding) => policyBinding.role === requiredBinding.role
      );
      if (ndx === -1) {
        policy.bindings.push(requiredBinding);
        continue;
      }
      requiredBinding.members.forEach((updatedMember) => {
        if (!policy.bindings[ndx].members.find((member) => member === updatedMember)) {
          policy.bindings[ndx].members.push(updatedMember);
        }
      });
    }
  }
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
): Promise<void> {
  // find new services
  const wantServices = backend.allEndpoints(want).reduce(reduceEventsToServices, []);
  const haveServices = backend.allEndpoints(have).reduce(reduceEventsToServices, []);
  const newServices = wantServices.filter(
    (wantS) => !haveServices.find((haveS) => wantS.name === haveS.name)
  );
  if (newServices.length === 0) {
    return;
  }
  // get the full project iam policy
  let policy: iam.Policy;
  try {
    policy = await getIamPolicy(projectId);
  } catch (err: any) {
    utils.logLabeledBullet(
      "functions",
      "Could not verify the necessary IAM configuration for the following newly-integrated services: " +
        `${newServices.map((service) => service.api).join(", ")}` +
        ". Deployment may fail.",
      "warn"
    );
    return;
  }
  // run in parallel all the missingProjectBindings jobs
  const findRequiredBindings: Array<Promise<Array<iam.Binding>>> = [];
  newServices.forEach((service) =>
    findRequiredBindings.push(service.requiredProjectBindings!(projectId, policy))
  );
  const allRequiredBindings = await Promise.all(findRequiredBindings);
  mergeBindings(policy, allRequiredBindings);
  // set the updated policy
  try {
    await setIamPolicy(projectId, policy, "bindings");
  } catch (err: any) {
    throw new FirebaseError(
      "We failed to modify the IAM policy for the project. The functions " +
        "deployment requires specific roles to be granted to service agents," +
        " otherwise the deployment will fail.",
      { original: err }
    );
  }
}
