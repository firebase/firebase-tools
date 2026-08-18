import * as clc from "colorette";
import * as functionsConfig from "../functionsConfig";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { reduceFlat } from "../functional";
import { requirePermissions } from "../requirePermissions";
import * as args from "../deploy/functions/args";
import * as helper from "../deploy/functions/functionsDeployHelper";
import * as utils from "../utils";
import * as backend from "../deploy/functions/backend";
import * as projectConfig from "../functions/projectConfig";
import * as planner from "../deploy/functions/release/planner";
import * as fabricator from "../deploy/functions/release/fabricator";
import * as executor from "../deploy/functions/release/executor";
import * as reporter from "../deploy/functions/release/reporter";
import { getProjectNumber } from "../getProjectNumber";

export const command = new Command("functions:delete [filters...]")
  .description("delete one or more Cloud Functions by name, group name, or codebase.")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. ",
  )
  .withForce()
  .before(requirePermissions, ["cloudfunctions.functions.list", "cloudfunctions.functions.delete"])
  .action(async (filters: string[], options: { force: boolean; region?: string } & Options) => {
    if (!filters.length) {
      return utils.reject("Must supply at least function or group name.");
    }

    const context: args.Context = {
      projectId: needProjectId(options),
      filters: [],
    };
    const [firebaseConfig, letExistingBackend] = await Promise.all([
      functionsConfig.getFirebaseConfig(options),
      backend.existingBackend(context),
    ]);
    let existingBackend = letExistingBackend;
    await backend.checkAvailability(context, /* want=*/ backend.empty());
    const appEngineLocation = functionsConfig.getAppEngineLocation(firebaseConfig);

    if (options.region) {
      existingBackend = backend.matchingBackend(
        existingBackend,
        (ep) => ep.region === options.region,
      );
    }

    // Discover all active codebases directly from live endpoints in prod backend.
    // If a codebase is not live in prod, there is nothing to delete.
    const activeCodebases = [
      ...new Set(
        backend
          .allEndpoints(existingBackend)
          .map((ep) => ep.codebase || projectConfig.DEFAULT_CODEBASE),
      ),
    ];
    context.filters = helper.parseDeleteFilters(filters, activeCodebases);

    const plan = await planner.createDeploymentPlan({
      wantBackend: backend.empty(),
      haveBackend: existingBackend,
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
      throw new FirebaseError(
        `The specified filters do not match any existing functions in project ${clc.bold(
          context.projectId,
        )}.`,
      );
    }

    // Inform the user when a name collision exists between a codebase name and a function name.
    // Codebase deletion takes precedence by design, but we provide the explicit '<codebase>:<name>' workaround.
    const allEndpoints = backend.allEndpoints(existingBackend);
    const collisions = helper.detectCodebaseAndIdCollisions(
      filters,
      activeCodebases,
      allEndpoints,
      projectConfig.DEFAULT_CODEBASE,
    );
    for (const c of collisions) {
      utils.logLabeledBullet(
        "functions",
        `Target '${clc.bold(c.filter)}' matches both a codebase and a function (${
          c.functionLabel
        }). Codebase deletion takes precedence. ` +
          `(To delete the function instead, run: ${clc.bold(c.workaroundCommand)})`,
      );
    }

    const deleteList = allEpToDelete.map((func) => `\t${helper.getFunctionLabel(func)}`).join("\n");
    const confirmDeletion = await confirm({
      message:
        "You are about to delete the following Cloud Functions:\n" +
        deleteList +
        "\n  Are you sure?",
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
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
      const fab = new fabricator.Fabricator({
        functionExecutor,
        // Note: we don't need the temporary concurrency reduction of 2, because that quota limit is for deploys
        runFunctionExecutor: functionExecutor,
        appEngineLocation,
        executor: new executor.QueueExecutor({}),
        sources: {},
        projectNumber:
          options.projectNumber || (await getProjectNumber({ projectId: context.projectId })),
        projectId: context.projectId,
      });
      const summary = await fab.applyPlan({ default: plan });

      await reporter.logAndTrackDeployStats(summary);
      reporter.printErrors(summary);
    } catch (err: unknown) {
      throw new FirebaseError("Failed to delete functions", {
        original: err as Error,
        exit: 1,
      });
    }
  });
