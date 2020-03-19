import { difference } from "lodash";
import { bold } from "cli-color";

import { request, resourceManagerOrigin } from "./api";
import getProjectId = require("./getProjectId");
import { requireAuth } from "./requireAuth";
import { debug } from "./logger";
import { FirebaseError } from "./error";

// Permissions required for all commands.
const BASE_PERMISSIONS = ["firebase.projects.get"];

export async function requirePermissions(options: any, permissions: string[] = []): Promise<void> {
  const projectId = getProjectId(options);
  const requiredPermissions = BASE_PERMISSIONS.concat(permissions).sort();

  await requireAuth(options);
  debug(
    `[iam] checking project ${projectId} for permissions ${JSON.stringify(requiredPermissions)}`
  );

  let response: any;
  try {
    response = await request("POST", `/v1/projects/${projectId}:testIamPermissions`, {
      auth: true,
      data: { permissions: requiredPermissions },
      origin: resourceManagerOrigin,
    });
  } catch (err) {
    debug(`[iam] error while checking permissions, command may fail: ${err}`);
    return;
  }

  const allowedPermissions = (response.body.permissions || []).sort();
  const missingPermissions = difference(requiredPermissions, allowedPermissions);
  if (missingPermissions.length) {
    throw new FirebaseError(
      `Authorization failed. This account is missing the following required permissions on project ${bold(
        projectId
      )}:\n\n  ${missingPermissions.join("\n  ")}`
    );
  }
}
