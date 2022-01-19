/* eslint-disable @typescript-eslint/ban-ts-comment */
import clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";

export default new Command("help [command]")
  .description("display help information")
  .action((commandName) => {
    // @ts-ignore
    const client = this.client; // eslint-disable-line @typescript-eslint/no-invalid-this
    const cmd = client.getCommand(commandName);
    if (cmd) {
      cmd.outputHelp();
    } else if (commandName) {
      logger.warn();
      utils.logWarning(
        clc.bold(commandName) + " is not a valid command. See below for valid commands"
      );
      client.cli.outputHelp();
    } else {
      client.cli.outputHelp();
      logger.info();
      logger.info(
        "  To get help with a specific command, type",
        clc.bold("firebase help [command_name]")
      );
      logger.info();
    }
  });
