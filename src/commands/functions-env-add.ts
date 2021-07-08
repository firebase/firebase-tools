import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:env:add [values...]")
  .description("add environment variables")
  .before(requirePermissions, ["firebase.envstores.create", "firebase.envstores.update"])
  .action(async (args: string[], options: any) => {
    if (!args.length) {
      return utils.reject("Must supply at least one key/value pair, e.g. " + clc.bold("FOO=bar"));
    }
    const projectId = getProjectId(options);
    const addEnvs: Record<string, string> = fenv.parseKvArgs(args);
    const envs = await fenv.addEnvs(projectId, addEnvs);
    logger.info(fenv.formatEnv(envs) + "\n");
    utils.logWarning(
      "Please deploy your functions for the change to take effect by running " +
        clc.bold("firebase deploy --only functions") +
        "."
    );
    return envs;
  });
