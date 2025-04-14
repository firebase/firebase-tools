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

  await setupArtifactCleanupPolicies(
    options,
    options.projectId!,
    Object.keys(wantBackend.endpoints),
  );

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
 * Sets up artifact cleanup policies for the regions where functions are deployed
 * and automatically sets up policies where needed.
 *
 * The policy is only set up when:
 *   1. No cleanup policy exists yet
 *   2. No other cleanup policies exist (beyond our own if we previously set one)
 *   3. User has not explicitly opted out
 *
 * In non-interactive mode:
 *   - With force flag: applies the default cleanup policy
 *   - Without force flag: warns and aborts deployment
 */
async function setupArtifactCleanupPolicies(
  options: Options,
  projectId: string,
  locations: string[],
): Promise<void> {
  if (locations.length === 0) {
    return;
  }

  const { locationsToSetup, locationsWithErrors: locationsWithCheckErrors } =
    await artifacts.checkCleanupPolicy(projectId, locations);

  if (locationsToSetup.length === 0) {
    return;
  }

  const daysToKeep = await prompts.promptForCleanupPolicyDays(options, locationsToSetup);

  utils.logLabeledBullet(
    "functions",
    `Configuring cleanup policy for ${locationsToSetup.length > 1 ? "repositories" : "repository"} in ${locationsToSetup.join(", ")}. ` +
      `Images older than ${daysToKeep} days will be automatically deleted.`,
  );

  const { locationsWithPolicy, locationsWithErrors: locationsWithSetupErrors } =
    await artifacts.setCleanupPolicies(projectId, locationsToSetup, daysToKeep);

  utils.logLabeledBullet(
    "functions",
    `Configured cleanup policy for ${locationsWithPolicy.length > 1 ? "repositories" : "repository"} in ${locationsToSetup.join(", ")}.`,
  );

  const locationsWithErrors = [...locationsWithCheckErrors, ...locationsWithSetupErrors];
  if (locationsWithErrors.length > 0) {
    utils.logLabeledWarning(
      "functions",
      `Failed to set up cleanup policy for repositories in ${locationsWithErrors.length > 1 ? "regions" : "region"} ` +
        `${locationsWithErrors.join(", ")}.` +
        "This could result in a small monthly bill as container images accumulate over time.",
    );
    throw new FirebaseError(
      `Functions successfully deployed but could not set up cleanup policy in ` +
        `${locationsWithErrors.length > 1 ? "regions" : "region"} ${locationsWithErrors.join(", ")}. ` +
        `Pass the --force option to automatically set up a cleanup policy or ` +
        "run 'firebase functions:artifacts:setpolicy' to set up a cleanup policy to automatically delete old images.",
    );
  }
}
