import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as functionsConfig from "../functionsConfig";
import { functionsConfigClone } from "../functionsConfigClone";
import * as utils from "../utils";

export const command = new Command("functions:config:clone")
  .description("clone environment config from another project")
  .option("--from <projectId>", "the project from which to clone configuration")
  .option("--only <keys>", "a comma-separated list of keys to clone")
  .option("--except <keys>", "a comma-separated list of keys to not clone")
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
  .action(async (options) => {
    const projectId = needProjectId(options);
    if (!options.from) {
      throw new FirebaseError(
        `Must specify a source project in ${clc.bold("--from <projectId>")} option.`,
      );
    } else if (options.from === projectId) {
      throw new FirebaseError("From project and destination can't be the same project.");
    } else if (options.only && options.except) {
      throw new FirebaseError("Cannot use both --only and --except at the same time.");
    }

    let only: string[] | undefined;
    let except: string[] = [];
    if (options.only) {
      only = options.only.split(",");
    } else if (options.except) {
      except = options.except.split(",");
    }

    await functionsConfigClone(options.from, projectId, only, except);
    utils.logSuccess(
      `Cloned functions config from ${clc.bold(options.from)} into ${clc.bold(projectId)}`,
    );
    logger.info(
      `\nPlease deploy your functions for the change to take effect by running ${clc.bold(
        "firebase deploy --only functions",
      )}\n`,
    );
  });
