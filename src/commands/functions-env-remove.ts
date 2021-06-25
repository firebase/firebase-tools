import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as env from "../functions/env";
import * as utils from "../utils";

export default new Command("functions:env:remove [keys...]")
  .description("remove environment variables associated with keys")
  .before(requirePermissions, ["firebase.envstores.update"])
  .before(env.ensureEnvStore)
  .action(async (args: string[], options) => {
    if (!args.length) {
      return utils.reject("Must supply at least one key");
    }
    const projectId = getProjectId(options);
    const envs = await env.removeKeys(projectId, args);
    logger.info(env.formatEnv(envs));
    return envs;
  });
