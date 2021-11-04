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
import { getAppEngineLocation } from "../../../functionsConfig";
import { getFunctionLabel } from "../functionsDeployHelper";
import { FirebaseError } from "../../../error";

/** Releases new versions of functions to prod. */
export async function release(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const plan = planner.createDeploymentPlan(
    payload.functions!.backend,
    await backend.existingBackend(context),
    { filters: context.filters }
  );

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
    sourceUrl: context.uploadUrl!,
    storage: context.storage!,
    appEngineLocation: getAppEngineLocation(context.firebaseConfig),
  });

  const summary = await fab.applyPlan(plan);

  await reporter.logAndTrackDeployStats(summary);
  reporter.printErrors(summary);

  // N.B. Fabricator::applyPlan updates the endpoints it deploys to include the
  // uri field. createDeploymentPlan copies endpoints by reference. Both of these
  // subtleties are so we can take out a round trip API call to get the latest
  // trigger URLs by calling existingBackend again.
  printTriggerUrls(payload.functions!.backend);

  const haveEndpoints = backend.allEndpoints(payload.functions!.backend);
  const deletedEndpoints = Object.values(plan)
    .map((r) => r.endpointsToDelete)
    .reduce(reduceFlat, []);
  await containerCleaner.cleanupBuildImages(haveEndpoints, deletedEndpoints);

  const allErrors = summary.results.filter((r) => r.error).map((r) => r.error) as Error[];
  if (allErrors.length) {
    const opts = allErrors.length == 1 ? { original: allErrors[0] } : { children: allErrors };
    throw new FirebaseError("There was an error deploying functions", { ...opts, exit: 2 });
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
      logger.debug("Missing URI for HTTPS function in printTriggerUrls. This shouldn't happen");
      continue;
    }
    logger.info(clc.bold("Function URL"), `(${getFunctionLabel(httpsFunc)}):`, httpsFunc.uri);
  }
}
