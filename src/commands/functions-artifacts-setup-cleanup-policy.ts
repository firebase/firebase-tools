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
 * Command to set up a cleanup policy for Cloud Run functions container images in Artifact Registry
 */
export const command = new Command("functions:artifacts:setup-cleanup-policy")
  .description(
    "Set up a cleanup policy for Cloud Run functions container images in Artifact Registry. " +
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
    "Number of days to keep container images before deletion. Default is 3 days.",
    "3",
  )
  .option(
    "--none",
    "Opt-out from cleanup policy. This will prevent suggestions to set up a cleanup policy during initialization and deployment.",
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
      if (artifacts.hasCleanupOptOut(repository)) {
        logBullet(`Repository '${repoPath}' is already opted out from cleanup policies.`);
        logBullet(`No changes needed.`);
        return;
      }

      logBullet(`You are about to opt-out from cleanup policy for repository '${repoPath}'.`);
      logBullet(
        `This will prevent suggestions to set up cleanup policy during initialization and deployment.`,
      );

      const existingPolicy = repository.cleanupPolicies?.[artifacts.CLEANUP_POLICY_ID];
      if (existingPolicy) {
        logBullet(`Note: This will remove the existing cleanup policy from the repository.`);
      }

      const confirmOptOut = await promptOnce(
        {
          type: "confirm",
          name: "confirm",
          default: true,
          message: "Do you want to continue?",
        },
        options,
      );

      if (!confirmOptOut) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }

      try {
        // Remove existing cleanup policy and add opt-out label
        const policies: artifactregistry.Repository["cleanupPolicies"] = {
          ...repository.cleanupPolicies,
        };
        if (artifacts.CLEANUP_POLICY_ID in policies) {
          delete policies[artifacts.CLEANUP_POLICY_ID];
        }
        const update: Partial<artifactregistry.Repository> = {
          name: repoPath,
          labels: { ...repository.labels, [artifacts.OPT_OUT_LABEL_KEY]: "true" },
          cleanupPolicies: policies,
        };
        await artifacts.updateRepository(update);
        logSuccess(`Successfully opted out from cleanup policy for ${clc.bold(repoPath)}`);
        return;
      } catch (err: unknown) {
        throw new FirebaseError("Failed to opt-out from artifact registry cleanup policy", {
          original: err as Error,
        });
      }
    }

    if (isNaN(daysToKeep) || daysToKeep <= 0) {
      throw new FirebaseError("Days must be a positive number");
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

    const optedOut = artifacts.hasCleanupOptOut(repository);
    if (optedOut) {
      logBullet(
        `Note: This repository was previously opted out from cleanup policy. This action will remove the opt-out status.`,
      );
    }

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

    const labels = { ...repository.labels };
    delete labels[artifacts.OPT_OUT_LABEL_KEY];
    const update: Partial<artifactregistry.Repository> = {
      name: repoPath,
      cleanupPolicies: {
        ...repository.cleanupPolicies,
        ...artifacts.generateCleanupPolicy(daysToKeep),
      },
      labels,
    };
    try {
      await artifacts.updateRepository(update);
      const successMessage = isUpdate
        ? `Successfully updated cleanup policy to delete images older than ${clc.bold(daysToKeep)} days`
        : `Successfully set up cleanup policy that deletes images older than ${clc.bold(daysToKeep)} days`;
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
