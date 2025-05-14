import { logger } from "../logger";
import * as resourceManager from "../gcp/resourceManager";
import * as iam from "../gcp/iam";
import { FirebaseError } from "../error";
import { Policy } from "../gcp/iam";

// Define Functions-specific IAM roles
export const FUNCTIONS_ROLES = {
  // Used by Functions v2 to push and pull from Artifact Registry
  runBuilder: "roles/run.builder",
  // Used by Functions to access Firebase services like RTDB, Storage, etc.
  sdkAdminServiceAgent: "roles/firebase.sdkAdminServiceAgent",
};

/**
 * Normalizes a role name by ensuring it has the "roles/" prefix
 * @param role The role name to normalize
 * @returns Normalized role name with "roles/" prefix
 */
export function normalizeRole(role: string): string {
  return role.startsWith("roles/") ? role : `roles/${role}`;
}

/**
 * Verifies if user has required permissions to grant IAM roles
 *
 * @param projectId The project ID
 * @returns Promise resolving to boolean indicating if user has permissions
 */
export async function ensurePermissionToGrantRoles(projectId: string): Promise<boolean> {
  try {
    const result = await iam.testIamPermissions(projectId, [
      "resourcemanager.projects.setIamPolicy",
    ]);
    return result.passed;
  } catch (err: unknown) {
    throw new FirebaseError(
      "You do not have permission to modify IAM policies on this project. " +
        "Please have an IAM administrator (e.g., a project owner or user with roles/resourcemanager.projects.setIamPolicy) " +
        "retry the command.",
      { original: err as Error },
    );
  }
}

/**
 * Grants IAM role(s) to a service account using the resourceManager API
 * @param projectId The project ID
 * @param serviceAccount The service account to grant permissions to
 * @param roles The role(s) to grant (will be normalized)
 * @returns Promise resolving to the updated IAM policy
 */
export async function grantRolesToServiceAccount(
  projectId: string,
  serviceAccountEmail: string,
  roles: string | string[],
): Promise<Policy> {
  const rolesToGrant = Array.isArray(roles) ? roles : [roles];
  const normalizedRoles = rolesToGrant.map(normalizeRole);

  try {
    // Leverage existing addServiceAccountToRoles function
    return await resourceManager.addServiceAccountToRoles(
      projectId,
      serviceAccountEmail,
      normalizedRoles,
      true, // Skip account lookup
    );
  } catch (err) {
    logger.debug("Error granting roles:", err);
    throw new FirebaseError(
      `Failed to grant ${normalizedRoles.join(", ")} to ${serviceAccountEmail}`,
      {
        original: err as Error,
      },
    );
  }
}
