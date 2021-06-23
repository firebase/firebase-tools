import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";

export default new Command("functions:env:clear")
  .description("clear all set environment variables")
  .before(requirePermissions, ["firebase.envstores.delete"])
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await fenv.clearEnvs(projectId);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
