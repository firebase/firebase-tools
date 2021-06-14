import { Command } from "../command";
import { ensure as ensureEnvStore } from "../functions/enableEnv";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";

export default new Command("functions:env:get")
  .description("fetch environment variables")
  .before(requirePermissions, ["firebase.envstores.get", "firebase.envstores.list"])
  .before(ensureEnvStore)
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await fenv.getEnvs(projectId);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
