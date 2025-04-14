import * as program from "commander";
import * as clc from "colorette";
import * as leven from "leven";

import { logger } from "./logger";
import { setupLoggers } from "./utils";

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

const client = {
  cli: program,
  logger: require("./logger"),
  errorOut: require("./errorOut").errorOut,
  getCommand: (name: string) => {
    for (let i = 0; i < client.cli.commands.length; i++) {
      if (client.cli.commands[i]._name === name) {
        return client.cli.commands[i];
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
    return leven(c, cmd) < c.length * 0.4;
  });
  if (suggestion) {
    logger.error();
    logger.error("Did you mean " + clc.bold(suggestion) + "?");
    return suggestion;
  }
}

const commandNames = program.commands.map((cmd: any) => {
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

// Default handler, this is called when no other command action matches.
program.action((_, args) => {
  setupLoggers();

  const cmd = args[0];
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
