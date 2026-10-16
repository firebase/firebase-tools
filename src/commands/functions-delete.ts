import * as clc from "colorette";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as args from "../deploy/functions/args";
import * as helper from "../deploy/functions/functionsDeployHelper";
import * as utils from "../utils";
import * as backend from "../deploy/functions/backend";
import * as projectConfig from "../functions/projectConfig";
import { deleteFunctionsByEndpointFilters } from "../deploy/functions/delete";
import { FirebaseError } from "../error";

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
    let existingBackend = await backend.existingBackend(context);
    await backend.checkAvailability(context, /* want=*/ backend.empty());

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

    const deletionCount = await deleteFunctionsByEndpointFilters(context, options);
    if (deletionCount === 0) {
      throw new FirebaseError(
        `The specified filters do not match any existing functions in project ${clc.bold(
          context.projectId,
        )}.`,
      );
    }
  });
