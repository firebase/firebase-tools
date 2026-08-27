import * as backend from "./backend";
import * as planner from "./release/planner";
import * as executor from "./release/executor";
import * as fabricator from "./release/fabricator";
import { EndpointFilter, getFunctionLabel } from "./functionsDeployHelper";
import { getProjectNumber } from "../../getProjectNumber";
import * as reporter from "./release/reporter";
import { Context } from "./args";
import { FirebaseError } from "../../error";
import { reduceFlat } from "../../functional";
import { confirm } from "../../prompt";
import { Options } from "../../options";

export async function deleteFunctionsByEndpointFilters(
  projectId: string,
  epFilters: EndpointFilter[],
  options?: Options,
): Promise<number> {
  const context: Context = {
    projectId: projectId,
    filters: epFilters,
  };
  const haveBackend = await backend.existingBackend(context);
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
  if (allEpToDelete.length > 0) {
    const deleteList = allEpToDelete.map((func) => `\t${getFunctionLabel(func)}`).join("\n");
    const skipPrompt = options?.nonInteractive ?? false;
    const promptForce = skipPrompt ? options?.force ?? false : false;
    const confirmDeletion = await confirm({
      message:
        "You are about to delete the following Cloud Functions:\n" +
        deleteList +
        "\n  Are you sure?",
      default: false,
      force: promptForce,
      nonInteractive: skipPrompt,
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
    // GAE location doesn't matter for deleting an existing codebase
    const appEngineLocation = "us-central1";
    try {
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
        throw new FirebaseError("Some functions deletions failed. Not modifying firebase.json.");
      }
    } catch (err: unknown) {
      throw new FirebaseError("Failed to delete functions", {
        original: err as Error,
        exit: 1,
      });
    }
  }

  return allEpToDelete.length;
}
