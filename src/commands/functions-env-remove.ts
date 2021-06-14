import { Command } from "../command";
import { ensure as ensureEnvStore } from "../functions/enableEnv";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as fenv from "../functions/env";
import * as utils from "../utils";

export default new Command("functions:env:remove [keys...]")
  .description("remove environment variables associated with keys")
  .before(requirePermissions, ["firebase.envstores.update"])
  .before(ensureEnvStore)
  .action(async (args: string[], options) => {
    if (!args.length) {
      return utils.reject("Must supply at least one key");
    }
    const projectId = getProjectId(options);
    const envs = await fenv.removeKeys(projectId, args);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
