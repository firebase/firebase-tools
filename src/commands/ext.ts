import * as _ from "lodash";
import * as clc from "cli-color";

import * as Command from "../command";
import * as getProjectId from "../getProjectId";
import * as modsHelper from "../extensions/modsHelper";
import { listMods } from "../extensions/listMods";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";
import * as logger from "../logger";

module.exports = new Command("ext")
  .description(
    "display information on how to use ext commands and extensions installed to your project"
  )
  .before(requirePermissions, ["deploymentmanager.deployments.get"])
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
      logger.info();
      logger.info(`${clc.bold(cmd._cmd)} - ${cmd._description}`);
      if (cmd._options.length > 0) {
        logger.info("Option(s):");
        _.forEach(cmd._options, (option) => {
          logger.info("  ", option[0], " ", option[1]);
        });
      }
      logger.info();
    });

    return listMods(projectId);
  });
