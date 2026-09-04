import * as backend from "./backend";
import * as planner from "./release/planner";
import * as executor from "./release/executor";
import * as fabricator from "./release/fabricator";
import { getFunctionLabel, endpointMatchesAnyFilter } from "./functionsDeployHelper";
import { getProjectNumber } from "../../getProjectNumber";
import * as reporter from "./release/reporter";
import * as prompt from "../../prompt";
import * as functionsConfig from "../../functionsConfig";
import { Context } from "./args";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { DEFAULT_CODEBASE } from "../../functions/projectConfig";

/**
 * Deletes Functions based on the provided EndpointFilter, which
 * allows deleting all functions that match a specific codebase, ID
 * prefix, or both.
 *
 * Asks for confirmation before delete. If CLI options are passed,
 * respects force and nonInteractive.
 *
 * Returns the number of functions deleted. Awaits the success or failure
 * of all delete operations before throwing if any operation failed.
 * @param context a Functions deploy context object, providing at least project id and filters, plus any cached GCP API call results.
 * @param options pass through CLI options.
 */
export async function deleteFunctionsByEndpointFilters(
  context: Context,
  options?: Options,
): Promise<number> {
  const allExistingBackend = await backend.existingBackend(context);
  const targetedRegionBackend = options?.region
    ? backend.matchingBackend(allExistingBackend, (endpoint) => endpoint.region === options.region)
    : allExistingBackend;

  const codebases = new Set(
    backend.allEndpoints(allExistingBackend).map((ep) => ep.codebase || DEFAULT_CODEBASE),
  );

  const deploymentPlan: planner.DeploymentPlan = {};
  for (const codebase of codebases) {
    const allCodebaseBackend = backend.matchingBackend(
      allExistingBackend,
      (ep) => (ep.codebase || DEFAULT_CODEBASE) === codebase,
    );
    const targetedCodebaseBackend = backend.matchingBackend(
      targetedRegionBackend,
      (ep) => (ep.codebase || DEFAULT_CODEBASE) === codebase,
    );

    const totalEndpointsInGcp = backend.allEndpoints(allCodebaseBackend);
    const endpointsToDelete = backend
      .allEndpoints(targetedCodebaseBackend)
      .filter((e) => endpointMatchesAnyFilter(e, context.filters));

    let existingManagedSA: string | undefined;
    if (endpointsToDelete.length > 0 && endpointsToDelete.length === totalEndpointsInGcp.length) {
      const ep = totalEndpointsInGcp.find(
        (e) => typeof e.serviceAccount === "string" && e.serviceAccount.startsWith("firebase-fn-"),
      );
      existingManagedSA = ep?.serviceAccount ?? undefined;
    }

    deploymentPlan[codebase] = await planner.createDeploymentPlan({
      wantBackend: backend.empty(),
      haveBackend: targetedCodebaseBackend,
      codebase,
      projectId: context.projectId,
      filters: context.filters,
      deleteAll: true,
      existingManagedSA,
    });
  }

  const allEpToDelete = Object.values(deploymentPlan)
    .flatMap((plan) =>
      Object.values(plan.regionalChangesets).flatMap((changes) => changes.endpointsToDelete),
    )
    .sort(backend.compareFunctions);
  if (allEpToDelete.length === 0) {
    return 0;
  }

  const deleteList = allEpToDelete.map((func) => `\t${getFunctionLabel(func)}`).join("\n");
  const saToDelete = Object.values(deploymentPlan)
    .map((p) => p.serviceAccountToDelete)
    .filter((sa): sa is string => !!sa);

  let message = "You are about to delete the following Cloud Functions:\n" + deleteList;
  if (saToDelete.length > 0) {
    const saList = saToDelete.map((sa) => `\t${sa}`).join("\n");
    message += "\n\nThe following managed service accounts will also be deleted:\n" + saList;
  }
  message += "\n  Are you sure?";

  const confirmDeletion = await prompt.confirm({
    message,
    default: false,
    force: options?.force,
    nonInteractive: options?.nonInteractive,
  });
  if (!confirmDeletion) {
    throw new FirebaseError("Command aborted.");
  }

  const functionExecutor: executor.QueueExecutor = new executor.QueueExecutor({
    retries: 30,
    backoff: 20000,
    concurrency: 40,
    maxBackoff: 40000,
  });

  try {
    const firebaseConfig = await functionsConfig.getFirebaseConfig({
      ...options,
      projectId: context.projectId,
    });
    const appEngineLocation = functionsConfig.getAppEngineLocation(firebaseConfig);
    const fab = new fabricator.Fabricator({
      functionExecutor,
      runFunctionExecutor: functionExecutor,
      appEngineLocation,
      executor: new executor.QueueExecutor({}),
      sources: {},
      projectNumber: await getProjectNumber({ projectId: context.projectId }),
      projectId: context.projectId,
    });
    const summary = await fab.applyPlan(deploymentPlan);

    await reporter.logAndTrackDeployStats(summary);
    reporter.printErrors(summary);
    if (summary.results.some((r) => r.error)) {
      throw new FirebaseError("At least one functions deletion operation failed.");
    }
    return allEpToDelete.length;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FirebaseError(`Failed to delete functions: ${message}`, {
      original: err instanceof Error ? err : undefined,
      exit: 1,
    });
  }
}
