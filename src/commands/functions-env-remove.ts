import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as fenv from "../functions/env";
import * as utils from "../utils";

export default new Command("functions:env:remove [keys...]")
  .description("remove environment variables associated with keys")
  .before(requirePermissions, ["firebase.envstores.update"])
  .action(async (args: string[], options) => {
    if (!args.length) {
      return utils.reject("Must supply at least one key");
    }
    const projectId = getProjectId(options);
    const envs = await fenv.removeKeys(projectId, args);
    logger.info(fenv.formatEnv(envs) + "\n");
    utils.logWarning(
      "Please deploy your functions for the change to take effect by running " +
        clc.bold("firebase deploy --only functions") +
        "."
    );
    return envs;
  });
