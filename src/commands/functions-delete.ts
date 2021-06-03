import { Command } from "../command";
import * as clc from "cli-color";
import * as functionsConfig from "../functionsConfig";
import { deleteFunctions } from "../functionsDelete";
import * as getProjectId from "../getProjectId";
import { promptOnce } from "../prompt";
import * as helper from "../deploy/functions/functionsDeployHelper";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import * as args from "../deploy/functions/args";
import * as backend from "../deploy/functions/backend";

export default new Command("functions:delete [filters...]")
  .description("delete one or more Cloud Functions by name or group name.")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. "
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["cloudfunctions.functions.list", "cloudfunctions.functions.delete"])
  .action(async (filters: string[], options: { force: boolean; region?: string }) => {
    if (!filters.length) {
      return utils.reject("Must supply at least function or group name.");
    }

    const context = {
      projectId: getProjectId(options),
    } as args.Context;

    // Dot notation can be used to indicate function inside of a group
    const filterChunks = filters.map((filter: string) => {
      return filter.split(".");
    });
    const [config, existingBackend] = await Promise.all([
      functionsConfig.getFirebaseConfig(options),
      backend.existingBackend(context),
    ]);
    await backend.checkAvailability(context, /* want=*/ backend.empty());
    const appEngineLocation = functionsConfig.getAppEngineLocation(config);

    const functionsToDelete = existingBackend.cloudFunctions.filter((fn) => {
      const regionMatches = options.region ? fn.region === options.region : true;
      const nameMatches = helper.functionMatchesAnyGroup(fn, filterChunks);
      return regionMatches && nameMatches;
    });
    if (functionsToDelete.length === 0) {
      return utils.reject(
        `The specified filters do not match any existing functions in project ${clc.bold(
          context.projectId
        )}.`,
        { exit: 1 }
      );
    }

    const schedulesToDelete = existingBackend.schedules.filter((schedule) => {
      functionsToDelete.some(backend.sameFunctionName(schedule.targetService));
    });
    const topicsToDelete = existingBackend.topics.filter((topic) => {
      functionsToDelete.some(backend.sameFunctionName(topic.targetService));
    });

    const deleteList = functionsToDelete
      .map((func) => {
        return "\t" + helper.getFunctionLabel(func);
      })
      .join("\n");
    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message:
          "You are about to delete the following Cloud Functions:\n" +
          deleteList +
          "\n  Are you sure?",
      },
      options
    );
    if (!confirmDeletion) {
      return utils.reject("Command aborted.", { exit: 1 });
    }
    return await deleteFunctions(
      functionsToDelete,
      schedulesToDelete,
      topicsToDelete,
      appEngineLocation
    );
  });
