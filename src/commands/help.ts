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
    const cmd = client.getCommand(commandName);
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
  });
