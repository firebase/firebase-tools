import { has, last } from "lodash";
import { bold } from "cli-color";

import { debug } from "../../logger";
import * as track from "../../track";
import { getReleaseNames, getFunctionsInfo, getFilterGroups } from "../../functionsDeployHelper";
import { FirebaseError } from "../../error";
import { testIamPermissions } from "../../gcp/iam";

const PERMISSION = "cloudfunctions.functions.setIamPolicy";

export async function checkHttpIam(context: any, options: any, payload: any): Promise<void> {
  const triggers = options.config.get("functions.triggers");
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
    throw new FirebaseError(
      `Missing required permission on project ${bold(
        context.projectId
      )} to create HTTPS functions.\n` +
        `Permission ${bold(PERMISSION)} is required for this deploy. Affected functions:\n\n- ` +
        newHttpFunctions.map((name) => last(name.split("/"))).join("\n- ") +
        "\n\n" +
        'To address this error, please ask a project owner to grant your account the "Develop Admin" role\n' +
        `in the Firebase Console: https://console.firebase.google.com/project/${context.projectId}/settings/iam`
    );
  }
  debug("[functions] found setIamPolicy permission, proceeding with deploy");
}
