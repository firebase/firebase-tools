import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { requireAuth } from "../requireAuth";
import { logBullet, logSuccess, logWarning } from "../utils";
import * as artifactregistry from "../gcp/artifactregistry";
import * as artifacts from "../functions/artifacts";
import * as prompts from "../deploy/functions/prompts";

/**
 * Command to set up a cleanup policy for Cloud Run functions container images in Artifact Registry
 */
export const command = new Command("functions:artifacts:setpolicy")
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
    `Number of days to keep container images before deletion. Default is ${artifacts.DEFAULT_CLEANUP_DAYS} day.`,
  )
  .option(
    "--none",
    "Opt-out from cleanup policy. This will prevent suggestions to set up a cleanup policy during initialization and deployment.",
  )
  .withForce("Automatically create or modify cleanup policy")
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
    const locationInput = options.location || "us-central1";
    const locations: string[] = locationInput.split(",").map((loc: string) => loc.trim());
    const uniqueLocations: string[] = [...new Set(locations)];

    if (uniqueLocations.length === 0) {
      throw new FirebaseError("No valid locations specified");
    }

    const checkResults = await artifacts.checkCleanupPolicy(projectId, uniqueLocations);

    const statusToLocations = Object.entries(checkResults).reduce<
      Record<artifacts.CheckPolicyResult, string[]>
    >(
      (acc, [location, status]) => {
        acc[status] = acc[status] || [];
        acc[status]!.push(location);
        return acc;
      },
      {} as Record<artifacts.CheckPolicyResult, string[]>,
    );

    const repoNotFound = statusToLocations["notFound"] || [];
    if (repoNotFound.length > 0) {
      logWarning(
        `Repository not found in ${repoNotFound.length > 1 ? "locations" : "location"} ${repoNotFound.join(", ")}`,
      );
      logBullet(
        `Please deploy your functions first using: ` +
          `${clc.bold(`firebase deploy --only functions`)}`,
      );
    }

    const repoErred = statusToLocations["errored"] || [];
    if (repoErred.length > 0) {
      logWarning(
        `Failed to retrieve state of ${repoErred.length > 1 ? "repositories" : "repository"} ${repoErred.join(", ")}`,
      );
      logWarning(`Skipping setting up cleanup policy. Please try again later.`);
    }

    if (options.none) {
      return await handleOptOut(projectId, statusToLocations, options);
    }

    let daysToKeep = parseInt(options.days || artifacts.DEFAULT_CLEANUP_DAYS, 10);

    if (isNaN(daysToKeep) || daysToKeep < 0) {
      throw new FirebaseError("Days must be a non-negative number");
    }

    if (daysToKeep === 0) {
      daysToKeep = 0.003472; // ~5 minutes in days
    }

    return await handleSetupPolicies(projectId, statusToLocations, daysToKeep, options);
  });

async function handleOptOut(
  projectId: string,
  checkResults: Record<artifacts.CheckPolicyResult, string[]>,
  options: any,
) {
  const locationsToOptOut = (
    ["foundPolicy", "noPolicy", "optedOut"] as artifacts.CheckPolicyResult[]
  ).flatMap((status) => checkResults[status] || []);

  if (locationsToOptOut.length === 0) {
    logBullet("No repositories to opt-out from cleanup policy");
    return;
  }

  logBullet(
    `You are about to opt-out from cleanup policies for ${prompts.formatMany(locationsToOptOut, "repository", "repositories")}`,
  );
  logBullet(
    `This will prevent suggestions to set up cleanup policy during initialization and deployment.`,
  );

  const reposWithPolicy = checkResults["foundPolicy"] || [];
  if (reposWithPolicy.length > 0) {
    logBullet(
      `Note: This will remove the existing cleanup policy for ${prompts.formatMany(locationsToOptOut, "repository", "repositories")}.`,
    );
  }

  const confirmOptOut = await confirm({
    ...options,
    default: true,
    message: `Do you want to opt-out from cleanup policies for ${locationsToOptOut.length} repositories?`,
  });

  if (!confirmOptOut) {
    throw new FirebaseError("Command aborted.", { exit: 1 });
  }

  const results = await artifacts.optOutRepositories(projectId, locationsToOptOut);

  const locationsOptedOutSuccessfully = Object.entries(results)
    .filter(([_, result]) => result.status === "success")
    .map(([location, _]) => location);

  const locationsWithErrors = Object.entries(results)
    .filter(([_, result]) => result.status === "errored")
    .map(([location, _]) => location);

  if (locationsOptedOutSuccessfully.length > 0) {
    logSuccess(
      `Successfully opted out ${prompts.formatMany(locationsOptedOutSuccessfully, "location")} from cleanup policies.`,
    );
  }

  if (locationsWithErrors.length > 0) {
    const errs = Object.entries(results)
      .filter(([_, result]) => result.status === "errored")
      .map(([_, result]) => result.error)
      .filter((err) => !!err);
    throw new FirebaseError(
      `Failed to complete opt-out for all repositories in ${prompts.formatMany(locationsWithErrors, "location")}.`,
      { children: errs },
    );
  }
}

async function handleSetupPolicies(
  projectId: string,
  checkResults: Record<artifacts.CheckPolicyResult, string[]>,
  daysToKeep: number,
  options: any,
) {
  const locationsNoPolicy = checkResults["noPolicy"] || [];
  const locationsWithPolicy = checkResults["foundPolicy"] || [];
  const locationsOptedOut = checkResults["optedOut"] || [];

  const locationsToSetup: string[] = [];
  const locationsWithSamePolicy: string[] = [];
  const locationsNeedingUpdate: string[] = [];

  for (const location of locationsWithPolicy) {
    const repo = await artifacts.getRepo(projectId, location);

    if (artifacts.hasSameCleanupPolicy(repo, daysToKeep)) {
      locationsWithSamePolicy.push(location);
      continue;
    }
    locationsNeedingUpdate.push(location);
    locationsToSetup.push(location);
  }

  locationsToSetup.push(...locationsNoPolicy, ...locationsOptedOut);

  if (locationsToSetup.length === 0) {
    if (locationsWithSamePolicy.length > 0) {
      logBullet(
        `A cleanup policy already exists that deletes images older than ${daysToKeep} days for ${prompts.formatMany(
          locationsWithSamePolicy,
          "repository",
          "repositories",
        )}.`,
      );
      logBullet(`No changes needed.`);
    } else {
      logBullet("No repositories need cleanup policy setup.");
    }
    return;
  }

  logBullet(
    `You are about to set up cleanup policies for ${prompts.formatMany(locationsToSetup, "repository", "repositories")}`,
  );
  logBullet(
    `This will automatically delete container images that are older than ${daysToKeep} days`,
  );
  logBullet(
    "This helps reduce storage costs by removing old container images that are no longer needed",
  );

  if (locationsNeedingUpdate.length > 0) {
    logBullet(
      `Note: This will update existing policies for ${prompts.formatMany(locationsNeedingUpdate, "repository", "repositories")}`,
    );
  }

  if (locationsOptedOut.length > 0) {
    logBullet(
      `Note: ${prompts.formatMany(locationsOptedOut, "Repository", "Repositories")} ${
        locationsOptedOut.length === 1 ? "was" : "were"
      } previously opted out from cleanup policy. This action will remove the opt-out status.`,
    );
  }

  if (!options.force) {
    const confirmSetup = await confirm({
      ...options,
      default: true,
      message: "Do you want to continue?",
    });

    if (!confirmSetup) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }
  }

  const setPolicyResults = await artifacts.setCleanupPolicies(
    projectId,
    locationsToSetup,
    daysToKeep,
  );

  const locationsConfiguredSuccessfully = Object.entries(setPolicyResults)
    .filter(([_, result]) => result.status === "success")
    .map(([location, _]) => location);

  const locationsWithSetupErrors = Object.entries(setPolicyResults)
    .filter(([_, result]) => result.status === "errored")
    .map(([location, _]) => location);

  if (locationsConfiguredSuccessfully.length > 0) {
    logSuccess(
      `Successfully updated cleanup policy to delete images older than ${daysToKeep} days for ${prompts.formatMany(
        locationsConfiguredSuccessfully,
        "repository",
        "repositories",
      )}`,
    );
  }
  if (locationsWithSetupErrors.length > 0) {
    const errs = Object.entries(setPolicyResults)
      .filter(([_, result]) => result.status === "errored")
      .map(([_, result]) => result.error)
      .filter((err) => !!err);

    throw new FirebaseError(
      `Failed to set up cleanup policy in ${prompts.formatMany(locationsWithSetupErrors, "location")}. ` +
        { children: errs },
    );
  }
}
