import * as artifactregistry from "../gcp/artifactregistry";
import { FirebaseError } from "../error";

/** Repository name used for Cloud Functions artifacts */
export const REPO_NAME = "gcf-artifacts";

/** ID used for cleanup policies created by Firebase Tools */
export const CLEANUP_POLICY_ID = "firebase-functions-cleanup";

/**
 * Construct the full path to a repository in Artifact Registry
 * @param projectId The ID of the project
 * @param location The location of the repository
 * @returns The full path to the repository
 */
export function makeRepoPath(projectId: string, location: string): string {
  return `projects/${projectId}/locations/${location}/repositories/${REPO_NAME}`;
}

/**
 * Extract an existing cleanup policy from the repository if it exists
 * @param repository The repository object
 * @param policyId The ID of the policy to look for
 * @returns The existing policy if found, undefined otherwise
 */
export function findExistingPolicy(
  repository: artifactregistry.Repository,
  policyId: string,
): artifactregistry.CleanupPolicy | undefined {
  if (!repository.cleanupPolicies) {
    return undefined;
  }

  return repository.cleanupPolicies[policyId];
}

/**
 * Convert days to seconds for olderThan property
 * @param days Number of days
 * @returns String representation of seconds with 's' suffix (e.g., "432000s")
 */
export function daysToSeconds(days: number): string {
  const seconds = days * 24 * 60 * 60;
  return `${seconds}s`;
}

/**
 * Extract the number of days from a policy's olderThan string
 * @example "432000s" -> 5 (5 days in seconds)
 * @param olderThan The olderThan string from the policy (format: "Ns" where N is number of seconds)
 * @returns The number of days, or undefined if format is invalid
 */
export function parseSecondsFromPolicy(olderThan: string): number | undefined {
  const match = olderThan.match(/^(\d+)s$/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Creates a cleanup policy patch request for Artifact Registry
 * @param policyId The ID to use for the cleanup policy
 * @param daysToKeep Number of days to keep images before deletion
 * @returns The patch request object
 */
export function createCleanupPolicyPatch(
  policyId: string,
  daysToKeep: number,
): artifactregistry.RepositoryPatch {
  return {
    cleanupPolicies: {
      [policyId]: {
        id: policyId,
        condition: {
          tagState: "ANY",
          olderThan: daysToSeconds(daysToKeep),
        },
        action: "DELETE",
      },
    },
  };
}

/**
 * Apply a cleanup policy to a repository
 * @param repoPath The full path to the repository
 * @param daysToKeep Number of days to keep images before deletion
 * @returns Promise that resolves when the policy is applied
 */
export async function applyCleanupPolicy(repoPath: string, daysToKeep: number): Promise<void> {
  if (isNaN(daysToKeep) || daysToKeep <= 0) {
    throw new FirebaseError("Days must be a positive number");
  }

  const patchRequest = createCleanupPolicyPatch(CLEANUP_POLICY_ID, daysToKeep);

  try {
    await artifactregistry.patchRepository(repoPath, patchRequest, "cleanupPolicies");
  } catch (err: any) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You don't have permission to set up cleanup policies for this repository.\n` +
          `To set up cleanup policies, ask your administrator to grant you the ` +
          `Artifact Registry Administrator (roles/artifactregistry.admin) IAM role on the repository project.`,
        { original: err, exit: 1 },
      );
    } else {
      throw new FirebaseError("Failed to set up artifact registry cleanup policy", {
        original: err,
      });
    }
  }
}

/**
 * Check if a repository has a cleanup policy with the exact same settings
 * @param repository The repository object
 * @param policyId The ID of the policy to check
 * @param daysToKeep The number of days to keep images
 * @returns True if the policy exists with the same settings, false otherwise
 */
export function hasSameCleanupPolicy(
  repository: artifactregistry.Repository,
  policyId: string,
  daysToKeep: number,
): boolean {
  const existingPolicy = findExistingPolicy(repository, policyId);
  if (
    existingPolicy &&
    existingPolicy.condition?.tagState === "ANY" &&
    existingPolicy.condition?.olderThan
  ) {
    const existingSeconds = parseSecondsFromPolicy(existingPolicy.condition.olderThan);
    if (existingSeconds !== undefined && existingSeconds === daysToKeep * 24 * 60 * 60) {
      return true;
    }
  }
  return false;
}
