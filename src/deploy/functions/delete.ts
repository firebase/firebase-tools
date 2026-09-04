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

  // Discover any managed service accounts (firebase-fn-*) used by endpoints slated for deletion.
  // When declarative security (requiresRole) is used, the CLI synthesizes and manages these service
  // accounts exclusively for the functions in that codebase.
  const deletedManagedSAs = new Set(
    allEpToDelete
      .map((e) => e.serviceAccount)
      .filter((sa): sa is string => typeof sa === "string" && sa.startsWith("firebase-fn-")),
  );

  // If all functions utilizing a managed service account are being deleted (i.e. no surviving
  // endpoints in haveBackend still reference it), mark that service account for deletion.
  // This prevents orphaned service accounts from accumulating in GCP IAM upon codebase deletion
  // or kit uninstallation, and avoids stale reference errors during subsequent reinstalls.
  const existingManagedSAs: string[] = [];
  if (deletedManagedSAs.size > 0) {
    const deletedIds = new Set(allEpToDelete.map((del) => `${del.region}/${del.id}`));
    const survivingEndpoints = backend
      .allEndpoints(haveBackend)
      .filter((e) => !deletedIds.has(`${e.region}/${e.id}`));
    const survivingSAs = new Set(survivingEndpoints.map((e) => e.serviceAccount));
    for (const sa of deletedManagedSAs) {
      if (!survivingSAs.has(sa)) {
        existingManagedSAs.push(sa);
      }
    }
  }

  if (existingManagedSAs.length > 0) {
    plan.serviceAccountToDelete = existingManagedSAs[0];
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
    const deploymentPlan: Record<string, planner.CodebasePlan> = { default: plan };
    for (let i = 1; i < existingManagedSAs.length; i++) {
      deploymentPlan[`cleanup-sa-${i}`] = {
        regionalChangesets: {},
        plannedBackend: backend.empty(),
        serviceAccountToDelete: existingManagedSAs[i],
      };
    }
    const summary = await fab.applyPlan(deploymentPlan);

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
