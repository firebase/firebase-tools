import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as functionsConfig from "../functionsConfig";
import * as utils from "../utils";

export const command = new Command("functions:config:set [values...]")
  .description("set environment config with key=value syntax")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.create",
    "runtimeconfig.configs.get",
    "runtimeconfig.configs.update",
    "runtimeconfig.configs.delete",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.create",
    "runtimeconfig.variables.get",
    "runtimeconfig.variables.update",
    "runtimeconfig.variables.delete",
  ])
  .before(functionsConfig.ensureApi)
  .action(async (args, options) => {
    if (!args.length) {
      throw new FirebaseError(
        `Must supply at least one key/value pair, e.g. ${clc.bold('app.name="My App"')}`,
      );
    }
    const projectId = needProjectId(options);
    const parsed = functionsConfig.parseSetArgs(args);
    const promises: Promise<any>[] = [];

    for (const item of parsed) {
      if (item.val === undefined) {
        throw new FirebaseError(`Unexpected undefined value for varId "${item.varId}`, { exit: 2 });
      }
      promises.push(
        functionsConfig.setVariablesRecursive(projectId, item.configId, item.varId, item.val),
      );
    }

    await Promise.all(promises);
    utils.logSuccess("Functions config updated.");
    logger.info(
      `\nPlease deploy your functions for the change to take effect by running ${clc.bold(
        "firebase deploy --only functions",
      )}\n`,
    );
  });
