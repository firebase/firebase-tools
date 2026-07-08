/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as clc from "colorette";

import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";

export const command = new Command("help [command]")
  .description("display help information")
  // This must stay `function (commandName)`.
  .action(function (commandName) {
    // @ts-ignore
    const client = this.client; // eslint-disable-line @typescript-eslint/no-invalid-this
    if (commandName && commandName.startsWith("deploy:")) {
      const targetName = commandName.split(":")[1];
      const { TARGETS, VALID_DEPLOY_TARGETS } = require("../deploy") as typeof import("../deploy");
      const isValidTarget = (VALID_DEPLOY_TARGETS as readonly string[]).includes(targetName);
      const target = isValidTarget ? TARGETS[targetName as keyof typeof TARGETS] : undefined;
      if (target && target.detailedHelp) {
        logger.info();
        logger.info(clc.bold(`Detailed deploy information for ${targetName}:`));
        logger.info();
        logger.info(target.detailedHelp);
        logger.info();
        return;
      } else {
        logger.warn();
        utils.logWarning(`No detailed deploy information found for target: ${targetName}`);
        logger.info(`Run ${clc.bold("firebase deploy --help")} to see valid deploy targets.`);
        logger.info();
        return;
      }
    }
    const cmd = commandName ? client.getCommand(commandName) : undefined;
    if (cmd) {
      cmd.outputHelp();
    } else if (commandName) {
      logger.warn();
      utils.logWarning(
        clc.bold(commandName) + " is not a valid command. See below for valid commands",
      );
      client.cli.outputHelp();
    } else {
      client.cli.outputHelp();
      logger.info();
      logger.info(
        "  To get help with a specific command, type",
        clc.bold("firebase help [command_name]"),
      );
      logger.info();
    }
    logger.info(" Privacy Policy: https://firebase.google.com/support/privacy");
    logger.info();
  });
