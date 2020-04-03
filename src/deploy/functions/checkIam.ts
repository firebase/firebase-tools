import { has, last } from "lodash";
import { bold } from "cli-color";

import { debug } from "../../logger";
import * as track from "../../track";
import { getReleaseNames, getFunctionsInfo, getFilterGroups } from "../../functionsDeployHelper";
import { FirebaseError } from "../../error";
import { testIamPermissions, testResourceIamPermissions } from "../../gcp/iam";

const PERMISSION = "cloudfunctions.functions.setIamPolicy";

export async function checkServiceAccountIam(projectId: string): Promise<void> {
  const saEmail = `${projectId}@appspot.gserviceaccount.com`;
  try {
    const { passed } = await testResourceIamPermissions(
      "https://iam.googleapis.com",
      "v1",
      `projects/${projectId}/serviceAccounts/${saEmail}`,
      ["iam.serviceAccounts.actAs"]
    );
    if (!passed) {
      throw new FirebaseError(
        `Missing permissions required for functions deploy. You must have permission ${bold(
          "iam.serviceAccounts.ActAs"
        )} on service account ${bold(saEmail)}.\n\n` +
          `To address this error, ask a ${bold(
            "project owner"
          )} to grant your account the "Service Account User" role from this URL:\n\n` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`
      );
    }
  } catch (err) {
    debug("[functions] service account IAM check errored, deploy may fail");
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
  context: { projectId: string; existingFunctions: { name: string }[] },
  options: unknown,
  payload: { functions: { triggers: { name: string; httpsTrigger?: {} }[] } }
): Promise<void> {
  const triggers = payload.functions.triggers;
  const functionsInfo = getFunctionsInfo(triggers, context.projectId);
  const filterGroups = getFilterGroups(options);

  const httpFunctionNames: string[] = functionsInfo
    .filter((f) => has(f, "httpsTrigger"))
    .map((f) => f.name);
  const httpFunctionFullNames: string[] = getReleaseNames(httpFunctionNames, [], filterGroups);
  const existingFunctionFullNames: string[] = context.existingFunctions.map(
    (f: { name: string }) => f.name
  );

  const newHttpFunctions = httpFunctionFullNames.filter(
    (name) => !existingFunctionFullNames.includes(name)
  );

  if (newHttpFunctions.length === 0) {
    return;
  }

  debug(
    "[functions] found",
    newHttpFunctions.length,
    "new HTTP functions, testing setIamPolicy permission..."
  );
  const { passed } = await testIamPermissions(context.projectId, [PERMISSION]);
  if (!passed) {
    track("Error (User)", "deploy:functions:http_create_missing_iam");
    throw new FirebaseError(
      `Missing required permission on project ${bold(
        context.projectId
      )} to create HTTPS functions. Permission ${bold(
        PERMISSION
      )} is required for this deploy. Affected functions:\n\n- ` +
        newHttpFunctions.map((name) => last(name.split("/"))).join("\n- ") +
        `\n\nTo address this error, please ask a project owner to grant your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`
    );
  }
  debug("[functions] found setIamPolicy permission, proceeding with deploy");
}
