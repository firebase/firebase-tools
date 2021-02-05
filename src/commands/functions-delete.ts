"use strict";

import * as _ from "lodash";

import { Command } from "../command";
import * as clc from "cli-color";
import * as cloudfunctions from "../gcp/cloudfunctions";
import * as functionsConfig from "../functionsConfig";
import { deleteFunctions } from "../functionsDelete";
import * as getProjectId from "../getProjectId";
import * as helper from "../functionsDeployHelper";
import { prompt } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

module.exports = new Command("functions:delete [filters...]")
  .description("delete one or more Cloud Functions by name or group name.")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. "
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["cloudfunctions.functions.list", "cloudfunctions.functions.delete"])
  .action(async (filters, options) => {
    if (!filters.length) {
      return utils.reject("Must supply at least function or group name.");
    }

    const projectId = getProjectId(options);

    // Dot notation can be used to indicate function inside of a group
    const filterChunks = filters.map((filter: string) => {
      return filter.split(".");
    });
    const config = await functionsConfig.getFirebaseConfig(options);
    const appEngineLocation = functionsConfig.getAppEngineLocation(config);
    const existingFns = await cloudfunctions.listAllFunctions(projectId);
    const allFnNames = _.map(existingFns, "name");
    const functionsToDelete = allFnNames.filter((fnName) => {
      const regionMatches = options.region ? helper.getRegion(fnName) === options.region : true;
      const nameMatches = helper.functionMatchesAnyGroup(fnName, filterChunks);
      return regionMatches && nameMatches;
    });
    if (functionsToDelete.length === 0) {
      return utils.reject(
        "The specified filters do not match any existing functions in project " +
          clc.bold(projectId) +
          ".",
        { exit: 1 }
      );
    }
    let confirmDeletion = false;
    if (!options.force) {
      const deleteList = functionsToDelete
        .map((func) => {
          return "\t" + helper.getFunctionLabel(func);
        })
        .join("\n");
      confirmDeletion = await prompt(options, [
        {
          type: "confirm",
          name: "confirm",
          default: false,
          message:
            "You are about to delete the following Cloud Functions:\n" +
            deleteList +
            "\n  Are you sure?",
        },
      ]);
    }
    if (!confirmDeletion && !options.force) {
      return utils.reject("Command aborted.", { exit: 1 });
    }
    return await deleteFunctions(functionsToDelete, projectId, appEngineLocation);
  });
