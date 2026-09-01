import * as backend from "./backend";
import * as planner from "./release/planner";
import * as executor from "./release/executor";
import * as fabricator from "./release/fabricator";
import { getFunctionLabel } from "./functionsDeployHelper";
import { getProjectNumber } from "../../getProjectNumber";
import * as reporter from "./release/reporter";
import { Context } from "./args";
import { FirebaseError } from "../../error";
import { reduceFlat } from "../../functional";
import { confirm } from "../../prompt";
import { Options } from "../../options";
import * as functionsConfig from "../../functionsConfig";

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
  let haveBackend = await backend.existingBackend(context);
  if (options?.region) {
    haveBackend = backend.matchingBackend(
      haveBackend,
      (endpoint) => endpoint.region === options.region,
    );
  }
  const plan = await planner.createDeploymentPlan({
    wantBackend: backend.empty(),
    haveBackend: haveBackend,
    codebase: "",
    projectId: context.projectId,
    filters: context.filters,
    deleteAll: true,
  });
  const allEpToDelete = Object.values(plan.regionalChangesets)
    .map((changes) => changes.endpointsToDelete)
    .reduce(reduceFlat, [])
    .sort(backend.compareFunctions);
  if (allEpToDelete.length === 0) {
    return 0;
  }

  const deleteList = allEpToDelete.map((func) => `\t${getFunctionLabel(func)}`).join("\n");
  const confirmDeletion = await confirm({
    message:
      "You are about to delete the following Cloud Functions:\n" + deleteList + "\n  Are you sure?",
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
    const summary = await fab.applyPlan({ default: plan });

    await reporter.logAndTrackDeployStats(summary);
    reporter.printErrors(summary);
    if (summary.results.some((r) => r.error)) {
      throw new FirebaseError("At least one functions deletion operation failed.");
    }
    return allEpToDelete.length;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to delete functions: ${err}`, {
      original: err as Error,
      exit: 1,
    });
  }
}
