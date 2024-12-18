import * as clc from "colorette";

import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import * as functionsConfig from "../functionsConfig.js";
import * as runtimeconfig from "../gcp/runtimeconfig.js";
import * as utils from "../utils.js";
import { FirebaseError } from "../error.js";

export const command = new Command("functions:config:unset [keys...]")
  .description("unset environment config at the specified path(s)")
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
      throw new FirebaseError("Must supply at least one key");
    }
    const projectId = needProjectId(options);
    const parsed = functionsConfig.parseUnsetArgs(args);
    await Promise.all(
      parsed.map((item) => {
        if (item.varId === "") {
          return runtimeconfig.configs.delete(projectId, item.configId);
        }
        return runtimeconfig.variables.delete(projectId, item.configId, item.varId);
      }),
    );
    utils.logSuccess("Environment updated.");
    logger.info(
      `\nPlease deploy your functions for the change to take effect by running ${clc.bold(
        "firebase deploy --only functions",
      )}\n`,
    );
  });
