import * as clc from "colorette";
import { CLIClient } from "../command";

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

/**
 * Patches a command's helpInformation method to filter the subcommand list.
 *
 * For a namespace command N, only subcommands C that start with "N:" and do not
 * contain another colon in the remainder are displayed.
 * For the root command (prefix = ""), only commands without a colon are displayed.
 */
function patchHelpInformation(cmd: any, prefix: string, program: any): void {
  const originalHelpInformation = cmd.helpInformation;

  cmd.helpInformation = function (this: any) {
    const filteredCommands = program.commands.filter((subCmd: any) => {
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

  // 2. Register dummy commands for missing namespaces
  for (const ns of allNamespaces) {
    if (!existingNames.has(ns)) {
      const description = NAMESPACE_DESCRIPTIONS[ns] || `manage ${ns} resources`;
      const nsCmd = program.command(ns);
      nsCmd.description(description);
      nsCmd.action(() => {
        nsCmd.outputHelp();
      });

      nsCmd.on("--help", () => {
        console.log();
        console.log("To see more about a specific command, run:");
        console.log(`  ${clc.bold("firebase " + ns + ":<command> --help")}`);
      });
    }
  }

  // 3. Patch helpInformation on the main program and all commands/namespaces
  patchHelpInformation(program, "", program);
  for (const cmd of program.commands) {
    const name = cmd.name();
    if (allNamespaces.has(name)) {
      patchHelpInformation(cmd, name, program);
    }
  }

  // 4. Register instruction listener on the main program
  program.on("--help", () => {
    console.log();
    console.log("To see more about a specific namespace or command, run:");
    console.log(`  ${clc.bold("firebase <namespace|command> --help")}`);
  });
}
