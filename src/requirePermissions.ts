import { bold } from "cli-color";
import getProjectId = require("./getProjectId");
import { requireAuth } from "./requireAuth";
import { debug } from "./logger";
import { FirebaseError } from "./error";
import { testIamPermissions } from "./gcp/iam";

// Permissions required for all commands.
const BASE_PERMISSIONS = ["firebase.projects.get"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requirePermissions(options: any, permissions: string[] = []): Promise<void> {
  const projectId = getProjectId(options);
  const requiredPermissions = BASE_PERMISSIONS.concat(permissions).sort();

  await requireAuth(options);

  if (process.env.FIREBASE_SKIP_INFORMATIONAL_IAM) {
    debug(
      "[iam] skipping informational IAM permission check as FIREBASE_SKIP_INFORMATIONAL_IAM is present"
    );
    return;
  }

  debug(
    `[iam] checking project ${projectId} for permissions ${JSON.stringify(requiredPermissions)}`
  );

  try {
    const iamResult = await testIamPermissions(projectId, requiredPermissions);
    if (!iamResult.passed) {
      throw new FirebaseError(
        `Authorization failed. This account is missing the following required permissions on project ${bold(
          projectId
        )}:\n\n  ${iamResult.missing.join("\n  ")}`
      );
    }
  } catch (err) {
    debug(`[iam] error while checking permissions, command may fail: ${err}`);
    return;
  }
}
