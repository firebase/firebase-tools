import * as artifactregistry from "../gcp/artifactregistry";
import { FirebaseError } from "../error";

/**
 * Repository name used by Cloud Run functions for storing artifacts.
 * See https://cloud.google.com/functions/docs/building#image_registry
 */
export const REPO_NAME = "gcf-artifacts";

/** ID used for cleanup policies created by Firebase CLI */
export const CLEANUP_POLICY_ID = "firebase-functions-cleanup";

/**
 * Label key used to mark repositories as opted-out from cleanup policy
 * This prevents prompts from being printed to encourage developers to
 * set up cleanup policies.
 */
export const OPT_OUT_LABEL_KEY = "firebase-functions-cleanup-opted-out";

const SECONDS_IN_DAY = 24 * 60 * 60;

/**
 * Construct the full path to a repository in Artifact Registry
 *
 * @returns The full path to the repository
 */
export function makeRepoPath(projectId: string, location: string): string {
  return `projects/${projectId}/locations/${location}/repositories/${REPO_NAME}`;
}

/**
 * Extract an existing cleanup policy from the repository if it exists
 *
 * @returns The existing policy if found, undefined otherwise
 */
export function findExistingPolicy(
  repository: artifactregistry.Repository,
): artifactregistry.CleanupPolicy | undefined {
  if (!repository.cleanupPolicies) {
    return;
  }
  return repository.cleanupPolicies[CLEANUP_POLICY_ID];
}

/**
 * Convert days to seconds for olderThan property in cleanup policy.
 *
 * @returns String representation of seconds with 's' suffix (e.g., "432000s")
 */
export function daysToSeconds(days: number): string {
  const seconds = days * SECONDS_IN_DAY;
  return `${seconds}s`;
}

/**
 * Extract the number of days from a policy's olderThan string
 *
 * @example "432000s" -> 5 (5 days in seconds)
 * @returns The number of days, or undefined if format is invalid
 */
export function parseDaysFromPolicy(olderThan: string): number | undefined {
  const match = olderThan.match(/^(\d+)s$/);
  if (match && match[1]) {
    const seconds = parseInt(match[1], 10);
    return Math.floor(seconds / SECONDS_IN_DAY);
  }
  return;
}

/**
 * Generate a cleanup policy configuration for Artifact Registry.
 *
 * @returns A basic cleanup policy configuration with given days.
 */
export function generateCleanupPolicy(
  daysToKeep: number,
): Record<string, artifactregistry.CleanupPolicy> {
  return {
    [CLEANUP_POLICY_ID]: {
      id: CLEANUP_POLICY_ID,
      condition: {
        tagState: "ANY",
        olderThan: daysToSeconds(daysToKeep),
      },
      action: "DELETE",
    },
  };
}

/**
 * Helper function to handle common error handling for repository operations
 */
export async function updateRepository(repo: Partial<artifactregistry.Repository>): Promise<void> {
  try {
    await artifactregistry.updateRepository(repo);
  } catch (err: any) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You don't have permission to update this repository.\n` +
          `To update repository settings, ask your administrator to grant you the ` +
          `Artifact Registry Administrator (roles/artifactregistry.admin) IAM role on the repository project.`,
        { original: err, exit: 1 },
      );
    } else {
      throw new FirebaseError("Failed to update artifact registry repository", {
        original: err,
      });
    }
  }
}

/**
 * Check if a repository has a cleanup policy with the exact same settings
 *
 * @returns True if the policy exists with the same settings, false otherwise
 */
export function hasSameCleanupPolicy(
  repository: artifactregistry.Repository,
  daysToKeep: number,
): boolean {
  const existingPolicy = findExistingPolicy(repository);
  if (!existingPolicy) {
    return false;
  }
  if (existingPolicy.condition?.tagState !== "ANY" || !existingPolicy.condition?.olderThan) {
    return false;
  }
  const existingSeconds = parseDaysFromPolicy(existingPolicy.condition.olderThan);
  return existingSeconds === daysToKeep;
}

/**
 * Checks if a repository has the designated label indicating it should be
 * opted out of the cleanup process.
 *
 * @returns True if the user explicilty opted out from cleanup policy.
 */
export function hasCleanupOptOut(repo: artifactregistry.Repository): boolean {
  return !!(repo.labels && repo.labels[OPT_OUT_LABEL_KEY] === "true");
}
