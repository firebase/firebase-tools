import { get } from "lodash";
import { join } from "path";

import { Command } from "../command";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as functionsConfig from "../functionsConfig";

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

export default new Command("functions:config:get [path]")
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
