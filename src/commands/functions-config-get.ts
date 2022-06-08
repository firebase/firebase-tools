import lodash from "lodash";
const { get } = lodash;
import { join } from "path";

import { Command } from "../command.js";
import { logger } from "../logger.js";
import { needProjectId } from "../projectUtils.js";
import { requirePermissions } from "../requirePermissions.js";
import * as functionsConfig from "../functionsConfig.js";

async function materialize(projectId: string, path?: string): Promise<any> {
  if (path === undefined) {
    return functionsConfig.materializeAll(projectId);
  }
  const parts = path.split(".");
  const configId = parts[0];
  const configName = join("projects", projectId, "configs", configId);
  const result = await functionsConfig.materializeConfig(configName, {});
  const query = parts.join(".");
  return query ? get(result, query) : result;
}

export const command = new Command("functions:config:get [path]")
  .description("fetch environment config stored at the given path")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(functionsConfig.ensureApi)
  .action(async (path, options) => {
    const result = await materialize(needProjectId(options), path);
    logger.info(JSON.stringify(result, null, 2));
    return result;
  });
