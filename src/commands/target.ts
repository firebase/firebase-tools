import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import { requireConfig } from "../requireConfig";
import * as utils from "../utils";

interface targetMap {
  [target: string]: string[];
}

function logTargets(type: string, targets: targetMap): void {
  logger.info(clc.cyan("[ " + type + " ]"));
  for (const [name, resources] of Object.entries(targets)) {
    logger.info(name, "(" + (resources || []).join(",") + ")");
  }
}

export default new Command("target [type]")
  .description("display configured deploy targets for the current project")
  .before(requireConfig)
  .action((type, options) => {
    if (!options.project) {
      return utils.reject("No active project, cannot list deploy targets.");
    }

    logger.info("Resource targets for", clc.bold(options.project) + ":");
    logger.info();
    if (type) {
      const targets = options.rc.targets(options.project, type);
      logTargets(type, targets);
      return targets;
    }

    const allTargets: { [product: string]: targetMap } = options.rc.allTargets(options.project);
    for (const [targetType, targetName] of Object.entries(allTargets)) {
      logTargets(targetType, targetName);
    }
    return allTargets;
  });
