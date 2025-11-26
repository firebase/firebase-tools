import * as updateNotifierPkg from "update-notifier-cjs";
import * as clc from "colorette";
import { markedTerminal } from "marked-terminal";
import { marked } from "marked";
marked.use(markedTerminal() as any);

import { CommanderStatic } from "commander";
import * as fs from "node:fs";

import { configstore } from "../configstore";
import { errorOut } from "../errorOut";
import { handlePreviewToggles } from "../handlePreviewToggles";
import { logger, useFileLogger } from "../logger";
import * as client from "..";
import * as fsutils from "../fsutils";
import * as utils from "../utils";

import { enableExperimentsFromCliEnvVariable } from "../experiments";
import { fetchMOTD } from "../fetchMOTD";

import { isCommandModule } from "../command";

export function cli(pkg: any) {
  const updateNotifier = updateNotifierPkg({ pkg });

  const args = process.argv.slice(2);
  let cmd: CommanderStatic;

  if (!process.env.DEBUG && args.includes("--debug")) {
    process.env.DEBUG = "true";
  }

  process.env.IS_FIREBASE_CLI = "true";

  const logFilename = useFileLogger();

  logger.debug("-".repeat(70));
  logger.debug("Command:      ", process.argv.join(" "));
  logger.debug("CLI Version:  ", pkg.version);
  logger.debug("Platform:     ", process.platform);
  logger.debug("Node Version: ", process.version);
  logger.debug("Time:         ", new Date().toString());
  if (utils.envOverrides.length) {
    logger.debug("Env Overrides:", utils.envOverrides.join(", "));
  }
  logger.debug("-".repeat(70));
  logger.debug();

  enableExperimentsFromCliEnvVariable();
  fetchMOTD();

  process.on("exit", (code) => {
    code = process.exitCode || code;
    if (!process.env.DEBUG && code < 2 && fsutils.fileExistsSync(logFilename)) {
      fs.unlinkSync(logFilename);
    }

    if (code > 0 && process.stdout.isTTY) {
      const lastError = configstore.get("lastError") || 0;
      const timestamp = Date.now();
      if (lastError > timestamp - 120000) {
        let help;
        if (code === 1 && cmd) {
          help = "Having trouble? Try " + clc.bold("firebase [command] --help");
        } else {
          help = "Having trouble? Try again or contact support with contents of firebase-debug.log";
        }

        if (cmd) {
          console.log();
          console.log(help);
        }
      }
      configstore.set("lastError", timestamp);
    } else {
      configstore.delete("lastError");
    }

    // Notify about updates right before process exit.
    try {
      const installMethod = !process.env.FIREPIT_VERSION ? "npm" : "automatic script";
      const updateCommand = !process.env.FIREPIT_VERSION
        ? "npm install -g firebase-tools"
        : "curl -sL https://firebase.tools | upgrade=true bash";

      const updateMessage =
        `Update available ${clc.gray("{currentVersion}")} → ${clc.green("{latestVersion}")}\n` +
        `To update to the latest version using ${installMethod}, run\n${clc.cyan(updateCommand)}\n` +
        `For other CLI management options, visit the ${marked(
          "[CLI documentation](https://firebase.google.com/docs/cli#update-cli)",
        )}`;
      // `defer: true` would interfere with commands that perform tasks (emulators etc.)
      // before exit since it installs a SIGINT handler that immediately exits. See:
      // https://github.com/firebase/firebase-tools/issues/4981
      updateNotifier.notify({ defer: false, isGlobal: true, message: updateMessage });
    } catch (err) {
      // This is not a fatal error -- let's debug log, swallow, and exit cleanly.
      logger.debug("Error when notifying about new CLI updates:");
      if (err instanceof Error) {
        logger.debug(err);
      } else {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.debug(`${err}`);
      }
    }
  });

  process.on("uncaughtException", (err) => {
    errorOut(err);
  });

  if (!handlePreviewToggles(args)) {
    // If this is a help command, load all commands so we can display them.
    const isHelp = !args.length || args[0] === "help" || (args.length === 1 && args[0] === "ext");
    if (isHelp) {
      const seen = new Set();
      const loadAll = (obj: any) => {
        if (seen.has(obj)) return;
        seen.add(obj);
        for (const [key, value] of Object.entries(obj)) {
          if (isCommandModule(value)) {
            value.load();
          } else if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value) &&
            key !== "cli"
          ) {
            loadAll(value);
          }
        }
      };
      loadAll(client);
    }
    // If there are no args, display help
    if (!args.length) {
      client.cli.help();
    } else {
      cmd = client.cli.parse(process.argv);
    }
  }
}
