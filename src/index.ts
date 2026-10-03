import * as program from "commander";
import * as clc from "colorette";
import { stringDistance } from "./utils";

import { logger } from "./logger";
import { argvWithCommandFirst, isCommandModule, CLIClient } from "./command";

const pkg = require("../package.json");

program.version(pkg.version);
program.option(
  "-P, --project <alias_or_project_id>",
  "the Firebase project to use for this command",
);
program.option("--account <email>", "the Google account to use for authorization");
program.option("-j, --json", "output JSON instead of text, also triggers non-interactive mode");
program.option(
  "--token <token>",
  "DEPRECATED - will be removed in a future major version - supply an auth token for this command",
);
program.option("--non-interactive", "error out of the command instead of waiting for prompts");
program.option("-i, --interactive", "force prompts to be displayed");
program.option("--debug", "print verbose debug output and keep a debug log file");
program.option("-c, --config <path>", "path to the firebase.json file to use for configuration");
program.allowUnknownOption();

const client: CLIClient = {
  cli: program,
  logger: require("./logger"),
  errorOut: require("./errorOut").errorOut,
  getCommand: (name: string) => {
    for (let i = 0; i < client.cli.commands.length; i++) {
      if (client.cli.commands[i]._name === name) {
        return client.cli.commands[i];
      }
    }
    const keys = name.split(":");
    let obj: any = client;
    for (const key of keys) {
      if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
        return;
      }
      const nextKey = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
      if (!nextKey) {
        return;
      }
      obj = obj[nextKey];
    }
    if (isCommandModule(obj)) {
      obj.load();
      for (let i = 0; i < client.cli.commands.length; i++) {
        if (client.cli.commands[i]._name === name) {
          return client.cli.commands[i];
        }
      }
    }
    return;
  },
};

require("./commands").load(client);

/**
 * Checks to see if there is a different command similar to the provided one.
 * This prints the suggestion and returns it if there is one.
 * @param cmd The command as provided by the user.
 * @param cmdList List of commands available in the CLI.
 * @return Returns the suggested command; undefined if none.
 */
function suggestCommands(cmd: string, cmdList: string[]): string | undefined {
  const suggestion = cmdList.find((c) => {
    return stringDistance(c, cmd) < c.length * 0.4;
  });
  if (suggestion) {
    logger.error();
    logger.error("Did you mean " + clc.bold(suggestion) + "?");
    return suggestion;
  }
}

const commandNames = program.commands.map((cmd) => {
  return cmd._name;
});

const RENAMED_COMMANDS: Record<string, string> = {
  "delete-site": "hosting:disable",
  "disable:hosting": "hosting:disable",
  "data:get": "database:get",
  "data:push": "database:push",
  "data:remove": "database:remove",
  "data:set": "database:set",
  "data:update": "database:update",
  "deploy:hosting": "deploy --only hosting",
  "deploy:database": "deploy --only database",
  "prefs:token": "login:ci",
};

function findCommandModule(name: string): unknown {
  let obj: unknown = client;
  for (const key of name.split(":")) {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
      return undefined;
    }
    const nextKey = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    if (!nextKey) {
      return undefined;
    }
    obj = (obj as Record<string, unknown>)[nextKey];
  }
  return obj;
}

// Default handler, this is called when no other command action matches.
program.action((_, args: string[]) => {
  // Command-specific options placed before the command name (e.g.
  // `firebase --instance foo database:get /`) end up in args ahead of it, so
  // look for the first arg that names a command rather than taking args[0].
  let cmd = args[0];
  let obj: unknown;
  for (const arg of args) {
    const found = arg.startsWith("-") ? undefined : findCommandModule(arg);
    if (isCommandModule(found)) {
      cmd = arg;
      obj = found;
      break;
    }
  }

  if (isCommandModule(obj)) {
    obj.load();
    client.cli.allowUnknownOption(false);
    const valueFlags = (program.options as program.Option[])
      .filter((option) => option.required || option.optional)
      .flatMap((option) => [option.short, option.long])
      .filter((flag): flag is string => !!flag);
    client.cli.parse(argvWithCommandFirst(process.argv, cmd, valueFlags));
    return;
  }

  logger.error(clc.bold(clc.red("Error:")), clc.bold(cmd), "is not a Firebase command");

  if (RENAMED_COMMANDS[cmd]) {
    logger.error();
    logger.error(
      clc.bold(cmd) + " has been renamed, please run",
      clc.bold("firebase " + RENAMED_COMMANDS[cmd]),
      "instead",
    );
  } else {
    // Check if the first argument is close to a command.
    if (!suggestCommands(cmd, commandNames)) {
      // Check to see if combining the two arguments comes close to a command.
      // e.g. `firebase hosting disable` may suggest `hosting:disable`.
      suggestCommands(args.join(":"), commandNames);
    }
  }

  process.exit(1);
});

// NB: Keep this export line to keep firebase-tools-as-a-module working.
export = client;
