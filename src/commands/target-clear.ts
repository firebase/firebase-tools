import * as clc from "cli-color";

import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import * as utils from "../utils";

export default new Command("target:clear <type> <target>")
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
