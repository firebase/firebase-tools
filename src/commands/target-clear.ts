import * as clc from "cli-color";

import { Command } from "../command.js";
import { requireConfig } from "../requireConfig.js";
import * as utils from "../utils.js";

export const command = new Command("target:clear <type> <target>")
  .description("clear all resources from a named resource target")
  .before(requireConfig)
  .action((type, name, options) => {
    const existed = options.rc.clearTarget(options.project, type, name);
    if (existed) {
      utils.logSuccess(`Cleared ${type} target ${clc.bold(name)}`);
    } else {
      utils.logWarning(`No action taken. No ${type} target found named ${clc.bold(name)}`);
    }
    return existed;
  });
