import * as clc from "cli-color";

import { Options } from "../../../options";
import { logger } from "../../../logger";
import { reduceFlat } from "../../../functional";
import * as args from "../args";
import * as backend from "../backend";
import * as containerCleaner from "../containerCleaner";
import * as planner from "./planner";
import * as fabricator from "./fabricator";
import * as reporter from "./reporter";
import * as executor from "./executor";
import * as prompts from "../prompts";
import * as secrets from "../../../functions/secrets";
import { getAppEngineLocation } from "../../../functionsConfig";
import { getFunctionLabel } from "../functionsDeployHelper";
import { FirebaseError } from "../../../error";
import { needProjectId, needProjectNumber } from "../../../projectUtils";
import { logLabeledBullet, logLabeledWarning } from "../../../utils";

/** Releases new versions of functions to prod. */
export async function release(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
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
  const shouldDelete = await prompts.promptForFunctionDeletion(
    fnsToDelete,
    options.force,
    options.nonInteractive
  );
  if (!shouldDelete) {
    for (const change of Object.values(plan)) {
      change.endpointsToDelete = [];
    }
  }

  const functionExecutor: executor.QueueExecutor = new executor.QueueExecutor({
    retries: 30,
    backoff: 20000,
    concurrency: 40,
    maxBackoff: 40000,
  });

  const fab = new fabricator.Fabricator({
    functionExecutor,
    executor: new executor.QueueExecutor({}),
    sources: context.sources,
    appEngineLocation: getAppEngineLocation(context.firebaseConfig),
  });

  const summary = await fab.applyPlan(plan);

  await reporter.logAndTrackDeployStats(summary);
  reporter.printErrors(summary);

  // N.B. Fabricator::applyPlan updates the endpoints it deploys to include the
  // uri field. createDeploymentPlan copies endpoints by reference. Both of these
  // subtleties are so we can take out a round trip API call to get the latest
  // trigger URLs by calling existingBackend again.
  const wantBackend = backend.merge(...Object.values(payload.functions).map((p) => p.wantBackend));
  printTriggerUrls(wantBackend);

  const haveEndpoints = backend.allEndpoints(wantBackend);
  const deletedEndpoints = Object.values(plan)
    .map((r) => r.endpointsToDelete)
    .reduce(reduceFlat, []);
  const opts: { ar?: containerCleaner.ArtifactRegistryCleaner } = {};
  if (!context.artifactRegistryEnabled) {
    opts.ar = new containerCleaner.NoopArtifactRegistryCleaner();
  }
  await containerCleaner.cleanupBuildImages(haveEndpoints, deletedEndpoints, opts);

  const allErrors = summary.results.filter((r) => r.error).map((r) => r.error) as Error[];
  if (allErrors.length) {
    const opts = allErrors.length === 1 ? { original: allErrors[0] } : { children: allErrors };
    throw new FirebaseError("There was an error deploying functions", { ...opts, exit: 2 });
  } else {
    if (secrets.of(haveEndpoints).length > 0) {
      const projectId = needProjectId(options);
      const projectNumber = await needProjectNumber(options);
      // Re-load backend with all endpoints, not just the ones deployed.
      const reloadedBackend = await backend.existingBackend({ projectId } as args.Context);
      const prunedResult = await secrets.pruneAndDestroySecrets(
        { projectId, projectNumber },
        backend.allEndpoints(reloadedBackend)
      );
      if (prunedResult.destroyed.length > 0) {
        logLabeledBullet(
          "functions",
          `Destroyed unused secret versions: ${prunedResult.destroyed
            .map((s) => `${s.secret}@${s.version}`)
            .join(", ")}`
        );
      }
      if (prunedResult.erred.length > 0) {
        logLabeledWarning(
          "functions",
          `Failed to destroy unused secret versions:\n\t${prunedResult.erred
            .map((err) => err.message)
            .join("\n\t")}`
        );
      }
    }
  }
}

/**
 * Prints the URLs of HTTPS functions.
 * Caller must eitehr force refresh the backend or assume the fabricator
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
        "Not printing URL for HTTPS function. Typically this means it didn't match a filter or we failed deployment"
      );
      continue;
    }
    logger.info(clc.bold("Function URL"), `(${getFunctionLabel(httpsFunc)}):`, httpsFunc.uri);
  }
}
