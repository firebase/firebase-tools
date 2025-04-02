import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { requireAuth } from "../requireAuth";
import { logBullet, logSuccess } from "../utils";
import * as artifactregistry from "../gcp/artifactregistry";
import * as artifacts from "../functions/artifacts";

/**
 * Command to set up a cleanup policy for Cloud Run functions container images in Artifact Registry
 */
export const command = new Command("functions:artifacts:setpolicy")
  .description(
    "set up a cleanup policy for Cloud Run functions container images in Artifact Registry " +
      "to automatically delete old function images",
  )
  .option(
    "--location <location>",
    "specify location to set up the cleanup policy. " +
      "If omitted, uses the default functions location",
    "us-central1",
  )
  .option(
    "--days <days>",
    `number of days to keep container images before deletion. Default is ${artifacts.DEFAULT_CLEANUP_DAYS} day`,
  )
  .option(
    "--none",
    "opt-out from cleanup policy. This will prevent suggestions to set up a cleanup policy during initialization and deployment",
  )
  .withForce("automatically create or modify cleanup policy")
  .before(requireAuth)
  .before(async (options) => {
    const projectId = needProjectId(options);
    await artifactregistry.ensureApiEnabled(projectId);
  })
  .before(requirePermissions, [
    "artifactregistry.repositories.update",
    "artifactregistry.versions.delete",
  ])
  .action(async (options: any) => {
    if (options.days && options.none) {
      throw new FirebaseError("Cannot specify both --days and --none options.");
    }
    const projectId = needProjectId(options);
    const location = options.location || "us-central1";
    let daysToKeep = parseInt(options.days || artifacts.DEFAULT_CLEANUP_DAYS, 10);

    const repoPath = artifacts.makeRepoPath(projectId, location);
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

    if (options.none) {
      const existingPolicy = artifacts.findExistingPolicy(repository);

      if (artifacts.hasCleanupOptOut(repository) && !existingPolicy) {
        logBullet(`Repository '${repoPath}' is already opted out from cleanup policies.`);
        logBullet(`No changes needed.`);
        return;
      }

      logBullet(`You are about to opt-out from cleanup policy for repository '${repoPath}'.`);
      logBullet(
        `This will prevent suggestions to set up cleanup policy during initialization and deployment.`,
      );

      if (existingPolicy) {
        logBullet(`Note: This will remove the existing cleanup policy from the repository.`);
      }

      const confirmOptOut = await confirm({
        ...options,
        default: true,
        message: "Do you want to continue?",
      });

      if (!confirmOptOut) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }

      try {
        await artifacts.optOutRepository(repository);
        logSuccess(`Successfully opted out from cleanup policy for ${clc.bold(repoPath)}`);
        return;
      } catch (err: unknown) {
        throw new FirebaseError("Failed to opt-out from artifact registry cleanup policy", {
          original: err as Error,
        });
      }
    }

    if (isNaN(daysToKeep) || daysToKeep < 0) {
      throw new FirebaseError("Days must be a non-negative number");
    }

    if (daysToKeep === 0) {
      daysToKeep = 0.003472; // ~5 minutes in days
    }

    if (artifacts.hasSameCleanupPolicy(repository, daysToKeep)) {
      logBullet(
        `A cleanup policy already exists that deletes images older than ${clc.bold(daysToKeep)} days.`,
      );
      logBullet(`No changes needed.`);
      return;
    }

    logBullet(
      `You are about to set up a cleanup policy for Cloud Run functions container images in location ${clc.bold(location)}`,
    );
    logBullet(
      `This policy will automatically delete container images that are older than ${clc.bold(daysToKeep)} days`,
    );
    logBullet(
      "This helps reduce storage costs by removing old container images that are no longer needed",
    );

    const existingPolicy = artifacts.findExistingPolicy(repository);

    let isUpdate = false;
    if (existingPolicy && existingPolicy.condition?.olderThan) {
      const existingDays = artifacts.parseDaysFromPolicy(existingPolicy.condition.olderThan);
      if (existingDays) {
        isUpdate = true;
        logBullet(
          `Note: This will update an existing policy that currently deletes images older than ${clc.bold(existingDays)} days`,
        );
      }
    }

    if (artifacts.hasCleanupOptOut(repository)) {
      logBullet(
        `Note: This repository was previously opted out from cleanup policy. This action will remove the opt-out status.`,
      );
    }

    const confirmSetup = await confirm({
      ...options,
      default: true,
      message: "Do you want to continue?",
    });

    if (!confirmSetup) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    try {
      await artifacts.setCleanupPolicy(repository, daysToKeep);
      const successMessage = isUpdate
        ? `Successfully updated cleanup policy to delete images older than ${clc.bold(daysToKeep)} days`
        : `Successfully set up cleanup policy that deletes images older than ${clc.bold(daysToKeep)} days`;
      logSuccess(successMessage);
      logBullet(`Cleanup policy has been set for ${clc.bold(repoPath)}`);
    } catch (err: unknown) {
      throw new FirebaseError("Failed to set up artifact registry cleanup policy", {
        original: err as Error,
      });
    }
  });
