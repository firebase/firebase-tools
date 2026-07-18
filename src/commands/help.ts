/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as clc from "colorette";
import type { Command as CommanderCommand } from "commander";

import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";

export const command = new Command("help [command]")
  .description("display help information")
  // This must stay `function (commandName)`.
  .action(function (commandName) {
    // @ts-ignore
    const client = this.client; // eslint-disable-line @typescript-eslint/no-invalid-this
    const cmd = commandName ? client.getCommand(commandName) : undefined;
    if (cmd) {
      cmd.outputHelp();
      return;
    }

    if (commandName) {
      // Treat the argument as a command namespace (e.g. "ailogic:providers") and walk
      // the nested client command tree segment by segment ("ailogic" -> "providers") to
      // check whether it resolves to a group of subcommands rather than a leaf command.
      const keys = commandName.split(":");
      let current = client;
      let matched = true;
      for (const key of keys) {
        if (!current || typeof current !== "object") {
          matched = false;
          break;
        }
        const nextKey = Object.keys(current).find((k) => k.toLowerCase() === key.toLowerCase());
        if (nextKey) {
          current = current[nextKey];
        } else {
          matched = false;
          break;
        }
      }

      // If it resolved to a namespace, print every registered command under that prefix
      // (e.g. `firebase help ailogic:providers` lists enable/disable/list).
      if (matched && current && typeof current === "object") {
        const prefix = commandName + ":";
        const subcmds = (client.cli.commands as CommanderCommand[]).filter((c) =>
          c.name().startsWith(prefix),
        );
        if (subcmds.length > 0) {
          logger.info();
          logger.info(clc.bold(`Commands under ${clc.green(commandName)}:`));
          logger.info();
          for (const subcmd of subcmds) {
            logger.info(`  ${clc.bold(subcmd.name().padEnd(45))} ${subcmd.description()}`);
          }
          logger.info();
          return;
        }
      }
    }

    if (commandName) {
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
