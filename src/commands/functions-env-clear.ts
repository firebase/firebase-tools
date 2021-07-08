import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:env:clear")
  .description("clear all set environment variables")
  .before(requirePermissions, ["firebase.envstores.delete"])
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await fenv.clearEnvs(projectId);
    logger.info(fenv.formatEnv(envs));
    utils.logWarning(
      "Please deploy your functions for the change to take effect by running " +
        clc.bold("firebase deploy --only functions") +
        "."
    );
    return envs;
  });
