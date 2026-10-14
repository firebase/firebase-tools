import * as artifactregistry from "../gcp/artifactregistry";
import { logger } from "../logger";
import { FirebaseError } from "../error";

/**
 * Repository id used by Cloud Run functions for storing artifacts.
 * See https://cloud.google.com/functions/docs/building#image_registry
 */
export const GCF_REPO_ID = "gcf-artifacts";

/** ID used for cleanup policies created by Firebase CLI */
export const CLEANUP_POLICY_ID = "firebase-functions-cleanup";

/**
 * Label key used to mark repositories as opted-out from cleanup policy
 * This prevents prompts from being printed to encourage developers to
 * set up cleanup policies.
 */
export const OPT_OUT_LABEL_KEY = "firebase-functions-cleanup-opted-out";

/**
 * Default number of days to keep container images for cleanup policies
 */
export const DEFAULT_CLEANUP_DAYS = 1;

const SECONDS_IN_DAY = 24 * 60 * 60;

/**
 * Construct the full path to a repository in Artifact Registry
 *
 * @returns The full path to the repository
 */
export function makeRepoPath(
  projectId: string,
  location: string,
  repoName: string = GCF_REPO_ID,
): string {
  return `projects/${projectId}/locations/${location}/repositories/${repoName}`;
}

/**
 * For testing purposes
 * TODO: Consider using cache object stored in deploy context instead of using globals.
 */
export const getRepoCache = new Map<string, artifactregistry.Repository>();

/**
 * Returns AR repository (cached)
 */
export async function getRepo(
  projectId: string,
  location: string,
  forceRefresh = false,
  repoName: string = GCF_REPO_ID,
): Promise<artifactregistry.Repository> {
  const repoPath = makeRepoPath(projectId, location, repoName);
  if (!forceRefresh && getRepoCache.has(repoPath)) {
    return getRepoCache.get(repoPath)!;
  }
  const repo = await artifactregistry.getRepository(repoPath);
  getRepoCache.set(repoPath, repo);
  return repo;
}

/**
 * Extract an existing cleanup policy from the repository if it exists
 *
 * @returns The existing policy if found, undefined otherwise
 */
export function findExistingPolicy(
  repository: artifactregistry.Repository,
): artifactregistry.CleanupPolicy | undefined {
  return repository?.cleanupPolicies?.[CLEANUP_POLICY_ID];
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
export async function updateRepository(repo: artifactregistry.RepositoryInput): Promise<void> {
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
 * Opt out a repository from cleanup policies and delete any existing policy
 */
export async function optOutRepository(repository: artifactregistry.Repository): Promise<void> {
  const policies: artifactregistry.Repository["cleanupPolicies"] = {
    ...repository.cleanupPolicies,
  };
  if (CLEANUP_POLICY_ID in policies) {
    delete policies[CLEANUP_POLICY_ID];
  }
  const update: artifactregistry.RepositoryInput = {
    name: repository.name,
    labels: { ...repository.labels, [OPT_OUT_LABEL_KEY]: "true" },
    cleanupPolicies: policies,
  };
  await exports.updateRepository(update);
}

/**
 * Set cleanup policy on a repository
 */
export async function setCleanupPolicy(
  repository: artifactregistry.Repository,
  daysToKeep: number,
): Promise<void> {
  const labels = { ...repository.labels };
  delete labels[OPT_OUT_LABEL_KEY];
  const update: artifactregistry.RepositoryInput = {
    name: repository.name,
    cleanupPolicies: {
      ...repository.cleanupPolicies,
      ...generateCleanupPolicy(daysToKeep),
    },
    cleanupPolicyDryRun: false,
    labels,
  };
  await exports.updateRepository(update);
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

/**
 * Checks whether a clean up policy is required for Artifact Registry in given locations.
 */
export async function checkCleanupPolicy(
  projectId: string,
  locations: string[],
): Promise<{ locationsToSetup: string[]; locationsWithErrors: string[] }> {
  if (locations.length === 0) {
    return { locationsToSetup: [], locationsWithErrors: [] };
  }

  const checkRepos = await Promise.allSettled(
    locations.map(async (location) => {
      try {
        const repository = await exports.getRepo(projectId, location);
        const hasPolicy = !!findExistingPolicy(repository);
        const hasOptOut = hasCleanupOptOut(repository);
        const hasOtherPolicies =
          repository.cleanupPolicies &&
          Object.keys(repository.cleanupPolicies).some((key) => key !== CLEANUP_POLICY_ID);

        return {
          location,
          repository,
          hasPolicy,
          hasOptOut,
          hasOtherPolicies,
        };
      } catch (err) {
        logger.debug(`Failed to check artifact cleanup policy for region ${location}:`, err);
        throw err;
      }
    }),
  );

  const locationsToSetup = [];
  const locationsWithErrors = [];

  for (let i = 0; i < checkRepos.length; i++) {
    const result = checkRepos[i];
    if (result.status === "fulfilled") {
      if (!(result.value.hasPolicy || result.value.hasOptOut || result.value.hasOtherPolicies)) {
        locationsToSetup.push(result.value.location);
      }
    } else {
      locationsWithErrors.push(locations[i]);
    }
  }
  return { locationsToSetup, locationsWithErrors };
}

/**
 * Sets Artifact Registry cleanup policies for given locations.
 */
export async function setCleanupPolicies(
  projectId: string,
  locations: string[],
  daysToKeep: number,
): Promise<{ locationsWithPolicy: string[]; locationsWithErrors: string[] }> {
  if (locations.length === 0) return { locationsWithPolicy: [], locationsWithErrors: [] };

  const locationsWithPolicy: string[] = [];
  const locationsWithErrors: string[] = [];

  const setupRepos = await Promise.allSettled(
    locations.map(async (location) => {
      try {
        logger.debug(`Setting up artifact cleanup policy for region ${location}`);
        const repo = await exports.getRepo(projectId, location);
        await exports.setCleanupPolicy(repo, daysToKeep);
        return location;
      } catch (err: unknown) {
        throw new FirebaseError("Failed to set up artifact cleanup policy", {
          original: err as Error,
        });
      }
    }),
  );

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const result = setupRepos[i];
    if (result.status === "rejected") {
      logger.debug(
        `Failed to set up artifact cleanup policy for region ${location}:`,
        result.reason,
      );
      locationsWithErrors.push(location);
    } else {
      locationsWithPolicy.push(location);
    }
  }

  return {
    locationsWithPolicy,
    locationsWithErrors,
  };
}
