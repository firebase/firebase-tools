import { bold } from "cli-color";

import { logger } from "../../logger";
import { getFilterGroups, functionMatchesAnyGroup } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { testIamPermissions, testResourceIamPermissions } from "../../gcp/iam";
import * as args from "./args";
import * as backend from "./backend";
import * as track from "../../track";

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
  options: args.Options,
  payload: args.Payload
): Promise<void> {
  const functions = payload.functions!.backend.cloudFunctions;
  const filterGroups = context.filters || getFilterGroups(options);

  const httpFunctions = functions
    .filter((f) => !backend.isEventTrigger(f.trigger))
    .filter((f) => functionMatchesAnyGroup(f, filterGroups));
  const existingFunctions = (await backend.existingBackend(context)).cloudFunctions;

  const newHttpFunctions = httpFunctions.filter(
    (func) => !existingFunctions.find(backend.sameFunctionName(func))
  );

  if (newHttpFunctions.length === 0) {
    return;
  }

  logger.debug(
    "[functions] found",
    newHttpFunctions.length,
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
        newHttpFunctions.map((func) => func.id).join("\n- ") +
        `\n\nTo address this error, please ask a project Owner to assign your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`
    );
  }
  logger.debug("[functions] found setIamPolicy permission, proceeding with deploy");
}
