import * as _ from "lodash";
import * as clc from "cli-color";

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { listExtensions } from "../extensions/listExtensions";
import { requirePermissions } from "../requirePermissions";
import * as logger from "../logger";

module.exports = new Command("ext")
  .description(
    "display information on how to use ext commands and extensions installed to your project"
  )
  .before(requirePermissions, ["firebasemods.instances.list"])
  .action((options: any) => {
    const projectId = getProjectId(options);
    const commands = [
      "ext-configure",
      "ext-info",
      "ext-install",
      "ext-list",
      "ext-uninstall",
      "ext-update",
    ];

    _.forEach(commands, (command) => {
      let cmd = require("./" + command);
      if (cmd.default) {
        cmd = cmd.default;
      }
      logger.info(`${clc.bold(cmd.cmd)} - ${cmd.descriptionText}`);
      if (cmd.options.length > 0) {
        logger.info("Option(s):");
        console.log(cmd.options);
        _.forEach(cmd.options, (option) => {
          logger.info("  ", option[0], " ", option[1]);
        });
      }
      logger.info();
    });

    return // listExtensions(projectId);
  });
