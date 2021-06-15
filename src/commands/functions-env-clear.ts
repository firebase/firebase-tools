import { Command } from "../command";
import { ensure as ensureEnvStore } from "../functions/ensureEnv";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";

export default new Command("functions:env:clear")
  .description("clear all set environment variables")
  .before(requirePermissions, ["firebase.envstores.delete"])
  .before(ensureEnvStore)
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await fenv.clearEnvs(projectId);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
