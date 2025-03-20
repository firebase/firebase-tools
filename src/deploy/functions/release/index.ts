import * as clc from "colorette";

import { Options } from "../../../options";
import { logger } from "../../../logger";
import { reduceFlat } from "../../../functional";
import * as utils from "../../../utils";
import * as args from "../args";
import * as backend from "../backend";
import * as planner from "./planner";
import * as fabricator from "./fabricator";
import * as reporter from "./reporter";
import * as executor from "./executor";
import * as prompts from "../prompts";
import { getAppEngineLocation } from "../../../functionsConfig";
import { getFunctionLabel } from "../functionsDeployHelper";
import { FirebaseError } from "../../../error";
import { getProjectNumber } from "../../../getProjectNumber";
import { release as extRelease } from "../../extensions";
import * as artifactregistry from "../../../gcp/artifactregistry";
import * as artifacts from "../../../functions/artifacts";

/** Releases new versions of functions and extensions to prod. */
export async function release(
  context: args.Context,
  options: Options,
  payload: args.Payload,
): Promise<void> {
  // Release extensions if any
  if (context.extensions && payload.extensions) {
    await extRelease(context.extensions, options, payload.extensions);
  }

  if (!context.config) {
    return;
  }
  if (!payload.functions) {
    return;
  }
  if (!context.sources) {
    return;
  }

  let plan: planner.DeploymentPlan = {};
  for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
    plan = {
      ...plan,
      ...planner.createDeploymentPlan({
        codebase,
        wantBackend,
        haveBackend,
        filters: context.filters,
      }),
    };
  }

  const fnsToDelete = Object.values(plan)
    .map((regionalChanges) => regionalChanges.endpointsToDelete)
    .reduce(reduceFlat, []);
  const shouldDelete = await prompts.promptForFunctionDeletion(fnsToDelete, options);
  if (!shouldDelete) {
    for (const change of Object.values(plan)) {
      change.endpointsToDelete = [];
    }
  }

  const fnsToUpdate = Object.values(plan)
    .map((regionalChanges) => regionalChanges.endpointsToUpdate)
    .reduce(reduceFlat, []);
  const fnsToUpdateSafe = await prompts.promptForUnsafeMigration(fnsToUpdate, options);
  // Replace endpointsToUpdate in deployment plan with endpoints that are either safe
  // to update or customers have confirmed they want to update unsafely
  for (const key of Object.keys(plan)) {
    plan[key].endpointsToUpdate = [];
  }
  for (const eu of fnsToUpdateSafe) {
    const e = eu.endpoint;
    const key = `${e.codebase || ""}-${e.region}-${e.availableMemoryMb || "default"}`;
    plan[key].endpointsToUpdate.push(eu);
  }

  const throttlerOptions = {
    retries: 30,
    backoff: 20000,
    concurrency: 40,
    maxBackoff: 100000,
  };

  const fab = new fabricator.Fabricator({
    functionExecutor: new executor.QueueExecutor(throttlerOptions),
    executor: new executor.QueueExecutor(throttlerOptions),
    sources: context.sources,
    appEngineLocation: getAppEngineLocation(context.firebaseConfig),
    projectNumber: options.projectNumber || (await getProjectNumber(context.projectId)),
  });

  const summary = await fab.applyPlan(plan);

  await reporter.logAndTrackDeployStats(summary, context);
  reporter.printErrors(summary);

  // N.B. Fabricator::applyPlan updates the endpoints it deploys to include the
  // uri field. createDeploymentPlan copies endpoints by reference. Both of these
  // subtleties are so we can take out a round trip API call to get the latest
  // trigger URLs by calling existingBackend again.
  const wantBackend = backend.merge(...Object.values(payload.functions).map((p) => p.wantBackend));
  printTriggerUrls(wantBackend);

  const haveEndpoints = backend.allEndpoints(wantBackend);

  await checkArtifactCleanupPolicies(options.projectId!, haveEndpoints);

  const allErrors = summary.results.filter((r) => r.error).map((r) => r.error) as Error[];
  if (allErrors.length) {
    const opts = allErrors.length === 1 ? { original: allErrors[0] } : { children: allErrors };
    logger.debug("Functions deploy failed.");
    for (const error of allErrors) {
      logger.debug(JSON.stringify(error, null, 2));
    }
    throw new FirebaseError("There was an error deploying functions", { ...opts, exit: 2 });
  }
}

/**
 * Prints the URLs of HTTPS functions.
 * Caller must either force refresh the backend or assume the fabricator
 * has updated the URI of endpoints after deploy.
 */
export function printTriggerUrls(results: backend.Backend): void {
  const httpsFunctions = backend.allEndpoints(results).filter(backend.isHttpsTriggered);
  if (httpsFunctions.length === 0) {
    return;
  }

  for (const httpsFunc of httpsFunctions) {
    if (!httpsFunc.uri) {
      logger.debug(
        "Not printing URL for HTTPS function. Typically this means it didn't match a filter or we failed deployment",
      );
      continue;
    }
    logger.info(clc.bold("Function URL"), `(${getFunctionLabel(httpsFunc)}):`, httpsFunc.uri);
  }
}

/**
 * Checks if artifact cleanup policies are set for the regions where functions are deployed
 * and automatically sets up policies where needed.
 *
 * The policy is only set up when:
 * 1. No cleanup policy exists yet
 * 2. No other cleanup policies exist (beyond our own if we previously set one)
 * 3. User has not explicitly opted out
 */
async function checkArtifactCleanupPolicies(
  projectId: string,
  endpoints: backend.Endpoint[],
): Promise<void> {
  if (endpoints.length === 0) {
    return;
  }

  const uniqueRegions = new Set<string>();
  for (const endpoint of endpoints) {
    uniqueRegions.add(endpoint.region);
  }

  const regionResults = await Promise.all(
    Array.from(uniqueRegions).map(async (region) => {
      try {
        const repoPath = artifacts.makeRepoPath(projectId, region);
        const repository = await artifactregistry.getRepository(repoPath);
        const existingPolicy = artifacts.findExistingPolicy(repository);
        const hasPolicy = !!existingPolicy;
        const hasOptOut = artifacts.hasCleanupOptOut(repository);

        // Check if there are any other cleanup policies beyond our own
        const hasOtherPolicies =
          repository.cleanupPolicies &&
          Object.keys(repository.cleanupPolicies).some(
            (key) => key !== artifacts.CLEANUP_POLICY_ID,
          );

        return {
          region,
          repository,
          hasPolicy,
          hasOptOut,
          hasOtherPolicies,
        };
      } catch (err) {
        logger.debug(`Failed to check artifact cleanup policy for region ${region}:`, err);
        return {
          region,
          hasPolicy: false,
          hasOptOut: false,
          hasOtherPolicies: false,
          error: err,
        };
      }
    }),
  );

  const regionsWithErrors = regionResults
    .filter((result) => result.error)
    .map((result) => result.region);

  const regionsToSetup = regionResults.filter(
    (result) => !result.hasPolicy && !result.hasOptOut && !result.hasOtherPolicies && !result.error,
  );

  const regionsNeedingWarning: string[] = [];

  if (regionsToSetup.length > 0) {
    utils.logLabeledSuccess(
      "functions",
      `Configuring a cleanup policy for repositories in ${regionsToSetup.join(", ")}. ` +
        `Images older than ${artifacts.DEFAULT_CLEANUP_DAYS} days will be automatically deleted.`,
    );
    const setupResults = await Promise.all(
      regionsToSetup.map(async (result) => {
        try {
          logger.debug(`Setting up artifact cleanup policy for region ${result.region}`);
          await artifacts.setCleanupPolicy(result.repository!, artifacts.DEFAULT_CLEANUP_DAYS);
          return { region: result.region, success: true };
        } catch (err) {
          logger.debug(
            `Failed to set up artifact cleanup policy for region ${result.region}:`,
            err,
          );
          regionsNeedingWarning.push(result.region);
          return { region: result.region, success: false, error: err };
        }
      }),
    );

    const failedSetups = setupResults.filter((r) => !r.success);
    if (failedSetups.length > 0) {
      logger.debug(
        `Failed to set up artifact cleanup policies for ${failedSetups.length} regions:`,
        failedSetups.map((f) => f.region).join(", "),
      );
    }
  }

  const regionsToWarn = [...regionsNeedingWarning, ...regionsWithErrors];

  if (regionsToWarn.length > 0) {
    utils.logLabeledWarning(
      "functions",
      `No cleanup policy detected for repositories in ${regionsToWarn.length > 1 ? "regions" : "region"} ` +
        `${regionsToWarn.join(", ")}. ` +
        "This could result in a small monthly bill as container images accumulate over time.",
    );
    utils.logLabeledBullet(
      "functions",
      "Run 'firebase functions:artifacts:setpolicy' to set up a cleanup policy to automatically delete old images.",
    );
  }
}
