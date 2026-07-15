import * as clc from "colorette";
import { CLIClient } from "../command";
import { logger } from "../logger";

const NAMESPACE_DESCRIPTIONS: Record<string, string> = {
  appdistribution: "manage App Distribution resources",
  apphosting: "manage App Hosting resources",
  apps: "manage Firebase apps",
  auth: "manage Firebase Auth",
  crashlytics: "manage Crashlytics symbols and mappings",
  database: "manage Realtime Database",
  dataconnect: "manage Data Connect resources",
  emulators: "start and manage local Firebase emulators",
  experiments: "enable and disable CLI experiments",
  ext: "manage Firebase Extensions",
  firestore: "manage Cloud Firestore resources",
  functions: "manage Cloud Functions",
  hosting: "manage Firebase Hosting sites and channels",
  projects: "manage Firebase projects",
  remoteconfig: "manage Remote Config",
  target: "manage deploy targets",
};

export interface CommanderCommand {
  helpInformation: (this: CommanderCommand) => string;
  commands: CommanderCommand[];
  name(): string;
}

/**
 * Patches a command's helpInformation method to filter the subcommand list.
 *
 * For a namespace command N, only subcommands C that start with "N:" and do not
 * contain another colon in the remainder are displayed.
 * For the root command (prefix = ""), only commands without a colon are displayed.
 */
function patchHelpInformation(
  cmd: CommanderCommand,
  prefix: string,
  program: CommanderCommand,
): void {
  const originalHelpInformation = cmd.helpInformation;

  cmd.helpInformation = function (this: CommanderCommand) {
    const filteredCommands = program.commands.filter((subCmd: CommanderCommand) => {
      const name = subCmd.name();
      if (prefix === "") {
        return !name.includes(":");
      } else {
        if (!name.startsWith(prefix + ":")) {
          return false;
        }
        const remainder = name.slice(prefix.length + 1);
        return !remainder.includes(":");
      }
    });

    const originalCommands = this.commands;
    this.commands = filteredCommands;

    const result = originalHelpInformation.call(this);

    this.commands = originalCommands;
    return result;
  };
}

/**
 * Automatically registers intermediate namespace commands and configures
 * progressive help for all command layers.
 */
export function setupProgressiveHelp(client: CLIClient): void {
  const program = client.cli;
  const existingNames = new Set(program.commands.map((cmd) => cmd.name()));

  // 1. Identify all unique namespaces (e.g. "firestore", "firestore:databases")
  const allNamespaces = new Set<string>();
  for (const cmd of program.commands) {
    const parts = cmd.name().split(":");
    for (let i = 1; i < parts.length; i++) {
      const ns = parts.slice(0, i).join(":");
      allNamespaces.add(ns);
    }
  }

  // 2. Register dummy commands for missing intermediate namespaces (e.g. "hosting", "database").
  // This allows Commander to parse them as valid subcommands, intercepting direct executions of
  // namespaces (e.g. `firebase hosting`) so we can trigger a fallback action that prints their
  // specific progressive help.
  for (const ns of allNamespaces) {
    if (!existingNames.has(ns)) {
      const description = NAMESPACE_DESCRIPTIONS[ns] || `manage ${ns} resources`;
      const nsCmd = program.command(ns);
      nsCmd.description(description);
      nsCmd.action(() => {
        nsCmd.outputHelp();
      });

      nsCmd.on("--help", () => {
        logger.info();
        logger.info("To see more about a specific command, run:");
        logger.info(`  ${clc.bold("firebase " + ns + ":<command> --help")}`);
      });
    }
  }

  // 2.5. Register dummy commands for deploy targets (e.g. "deploy:firestore")
  // to support "firebase deploy:<target> --help"
  try {
    const { TARGETS, VALID_DEPLOY_TARGETS } = require("../deploy");
    for (const targetName of VALID_DEPLOY_TARGETS) {
      const ns = `deploy:${targetName}`;
      if (!existingNames.has(ns)) {
        const target = TARGETS[targetName];
        const description = target.help || `deploy ${targetName} resources`;
        const nsCmd = program.command(ns);
        nsCmd.description(description);
        nsCmd.action(() => {
          nsCmd.outputHelp();
          logger.info();
          logger.info(`To deploy ${targetName}, run: ${clc.bold("firebase deploy --only " + targetName)}`);
          logger.info();
        });

        nsCmd.on("--help", () => {
          logger.info();
          logger.info(clc.bold(`Detailed setup and configuration for ${targetName}:`));
          logger.info();
          if (target && target.detailedHelp) {
            logger.info(target.detailedHelp);
          } else {
            logger.info(`Configuration for ${clc.bold(targetName)} is defined in your project's ${clc.bold("firebase.json")}.`);
            logger.info(`For more details, see the Firebase documentation:`);
            logger.info(`  https://firebase.google.com/docs/cli#the_firebasejson_file`);
          }
          logger.info();
          logger.info(clc.bold("General help for firebase deploy:"));
          logger.info();
          const deployCmd = program.commands.find((c) => c.name() === "deploy");
          if (deployCmd) {
            deployCmd.outputHelp();
          }
        });
      }
    }
  } catch (e) {
    // If deploy cannot be resolved, skip.
  }

  // 3. Patch helpInformation on the main program and all commands/namespaces
  const progTyped = program as unknown as CommanderCommand;
  patchHelpInformation(progTyped, "", progTyped);
  for (const cmd of program.commands) {
    const name = cmd.name();
    if (allNamespaces.has(name)) {
      patchHelpInformation(cmd as unknown as CommanderCommand, name, progTyped);
    }
  }

  // 4. Register instruction listener on the main program
  program.on("--help", () => {
    logger.info();
    logger.info("To see more about a specific namespace or command, run:");
    logger.info(`  ${clc.bold("firebase <namespace|command> --help")}`);
  });
}
