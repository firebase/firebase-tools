import * as resourceManager from "../gcp/resourceManager";
import * as iam from "../gcp/iam";
import { FirebaseError } from "../error";
import { Policy } from "../gcp/iam";

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
 * @returns Promise resolving if user has permissions, reject otherwise
 */
export async function ensurePermissionToGrantRoles(projectId: string): Promise<void> {
  try {
    const result = await iam.testIamPermissions(projectId, [
      "resourcemanager.projects.setIamPolicy",
    ]);
    if (!result.passed) {
      throw new Error("User does not have the 'resourcemanager.projects.setIamPolicy' permission.");
    }
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
  serviceAccount: string,
  roles: string[],
): Promise<Policy> {
  const normalizedRoles = roles.map(normalizeRole);
  try {
    return await resourceManager.addServiceAccountToRoles(
      projectId,
      serviceAccount,
      normalizedRoles,
      true,
    );
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to grant ${normalizedRoles.join(", ")} to ${serviceAccount}: ${(err as Error).message}`,
      {
        original: err as Error,
      },
    );
  }
}
