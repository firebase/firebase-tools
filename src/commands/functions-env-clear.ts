import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as env from "../functions/env";
import * as getProjectId from "../getProjectId";

export default new Command("functions:env:clear")
  .description("clear all set environment variables")
  .before(requirePermissions, ["firebase.envstores.delete"])
  .before(env.ensureEnvStore)
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await env.clearEnvs(projectId);
    logger.info(env.formatEnv(envs));
    return envs;
  });
