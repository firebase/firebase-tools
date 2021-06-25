import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as env from "../functions/env";
import * as getProjectId from "../getProjectId";

export default new Command("functions:env:get")
  .description("fetch environment variables")
  .before(requirePermissions, ["firebase.envstores.get", "firebase.envstores.list"])
  .before(env.ensureEnvStore)
  .action(async (options) => {
    const projectId = getProjectId(options);
    const envs = await env.getEnvs(projectId);
    logger.info(env.formatEnv(envs));
    return envs;
  });
