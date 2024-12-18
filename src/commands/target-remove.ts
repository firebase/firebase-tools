import * as clc from "colorette";

import { Command } from "../command.js";
import { requireConfig } from "../requireConfig.js";
import * as utils from "../utils.js";

export const command = new Command("target:remove <type> <resource>")
  .description("remove a resource target")
  .before(requireConfig)
  .action((type, resource, options) => {
    const name = options.rc.removeTarget(options.project, type, resource);
    if (name) {
      utils.logSuccess(`Removed ${type} target ${clc.bold(name)} from ${clc.bold(resource)}`);
    } else {
      utils.logWarning(
        `No action taken. No target found for ${type} resource ${clc.bold(resource)}`,
      );
    }
    return Promise.resolve(name);
  });
