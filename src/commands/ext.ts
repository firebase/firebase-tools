import * as _ from "lodash";
import * as clc from "cli-color";

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { logPrefix } from "../extensions/extensionsHelper";
import { listExtensions } from "../extensions/listExtensions";
import { requirePermissions } from "../requirePermissions";
import * as logger from "../logger";
import * as utils from "../utils";
import { CommanderStatic } from "commander";

module.exports = new Command("ext")
  .description(
    "display information on how to use ext commands and extensions installed to your project"
  )
  .action(async (options: any) => {
    // Print out help info for all extensions commands.
    utils.logLabeledBullet(logPrefix, "list of extensions commands:");
    const firebaseTools = require("../"); // eslint-disable-line @typescript-eslint/no-var-requires
    const commandNames = [
      "ext:install",
      "ext:info",
      "ext:list",
      "ext:configure",
      "ext:update",
      "ext:uninstall",
    ];

    _.forEach(commandNames, (commandName) => {
      const command: CommanderStatic = firebaseTools.getCommand(commandName);
      logger.info(clc.bold("\n" + command.name()));
      command.outputHelp();
    });
    logger.info();

    // Print out a list of all extension instances on project, if called with a project.
    try {
      await requirePermissions(options, ["firebasemods.instances.list"]);
      const projectId = getProjectId(options);
      return listExtensions(projectId);
    } catch (err) {
      return;
    }
  });
