import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { requireAuth } from "../requireAuth";
import { logBullet, logSuccess } from "../utils";
import * as artifactregistry from "../gcp/artifactregistry";
import * as artifacts from "../functions/artifacts";

/**
 * Command to set up a cleanup policy for Cloud Functions container images in Artifact Registry
 */
export const command = new Command("functions:artifacts:setup-cleanup-policy")
  .description(
    "Set up a cleanup policy for Cloud Functions container images in Artifact Registry. " +
      "This policy will automatically delete old container images created during functions deployment.",
  )
  .option(
    "--location <location>",
    "Specify location to set up the cleanup policy. " +
      "If omitted, uses the default functions location.",
    "us-central1",
  )
  .option(
    "--days <days>",
    "Number of days to keep container images before deletion. Default is 5 days.",
    "5",
  )
  .before(requireAuth)
  .before(artifactregistry.ensureApiEnabled)
  .before(requirePermissions, [
    "artifactregistry.repositories.update",
    "artifactregistry.versions.delete",
  ])
  .action(async (options: any) => {
    const projectId = needProjectId(options);
    const location = options.location || "us-central1";
    const daysToKeep = parseInt(options.days || "5", 10);

    if (isNaN(daysToKeep) || daysToKeep <= 0) {
      throw new FirebaseError("Days must be a positive number");
    }

    const repoPath = artifacts.makeRepoPath(projectId, location);

    // Check repository existence early before asking for confirmation
    let repository: artifactregistry.Repository;
    try {
      repository = await artifactregistry.getRepository(repoPath);
    } catch (err: any) {
      if (err.status === 404) {
        logBullet(`Repository '${repoPath}' does not exist in Artifact Registry.`);
        logBullet(
          `Please deploy your functions first using: ` +
            `${clc.bold(`firebase deploy --only functions`)}`,
        );
        return;
      }
      throw err;
    }

    // Check if the repository already has the same policy
    if (artifacts.hasSameCleanupPolicy(repository, artifacts.CLEANUP_POLICY_ID, daysToKeep)) {
      logBullet(
        `A cleanup policy already exists that deletes images older than ${daysToKeep} days.`,
      );
      logBullet(`No changes needed.`);
      return;
    }

    // Show information about what will be done
    logBullet(
      `You are about to set up a cleanup policy for Cloud Functions container images in location ${clc.bold(location)}`,
    );
    logBullet(
      `This policy will automatically delete container images that are older than ${clc.bold(daysToKeep.toString())} days`,
    );
    logBullet(
      "This helps reduce storage costs by removing old container images that are no longer needed",
    );

    // Show update information if we're updating an existing policy
    const existingPolicy = artifacts.findExistingPolicy(repository, artifacts.CLEANUP_POLICY_ID);
    let isUpdate = false;
    if (existingPolicy && existingPolicy.condition?.olderThan) {
      const existingDays = artifacts.parseDaysFromPolicy(existingPolicy.condition.olderThan);
      if (existingDays !== undefined) {
        isUpdate = true;
        logBullet(
          `Note: This will update an existing policy that currently deletes images older than ${existingDays} days`,
        );
      }
    }

    // Confirm the action with the user
    const confirmSetup = await promptOnce(
      {
        type: "confirm",
        name: "confirm",
        default: true,
        message: "Do you want to continue?",
      },
      options,
    );

    if (!confirmSetup) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    try {
      await artifacts.applyCleanupPolicy(repoPath, daysToKeep);

      const successMessage = isUpdate
        ? `Successfully updated cleanup policy to delete images older than ${daysToKeep} days`
        : `Successfully set up cleanup policy that deletes images older than ${daysToKeep} days`;

      logSuccess(successMessage);
      logBullet(`Cleanup policy has been set for ${clc.bold(repoPath)}`);
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        throw err;
      }
      throw new FirebaseError("Failed to set up artifact registry cleanup policy", {
        original: err as Error,
      });
    }
  });