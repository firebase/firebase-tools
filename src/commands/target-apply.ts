import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import * as requireConfig from "../requireConfig";
import * as utils from "../utils";
import { FirebaseError } from "../error";

export default new Command("target:apply <type> <name> <resources...>")
  .description("apply a deploy target to a resource")
  .before(requireConfig)
  .action((type, name, resources, options) => {
    if (!options.project) {
      throw new FirebaseError(
        `Must have an active project to set deploy targets. Try ${clc.bold("firebase use --add")}`
      );
    }

    const changes = options.rc.applyTarget(options.project, type, name, resources);

    utils.logSuccess(
      `Applied ${type} target ${clc.bold(name)} to ${clc.bold(resources.join(", "))}`
    );
    for (const change of changes) {
      utils.logWarning(
        `Previous target ${clc.bold(change.target)} removed from ${clc.bold(change.resource)}`
      );
    }
    logger.info();
    logger.info(`Updated: ${name} (${options.rc.target(options.project, type, name).join(",")})`);
  });
