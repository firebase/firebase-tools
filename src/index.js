"use strict";

var program = require("commander");
var pkg = require("../package.json");
var clc = require("cli-color");
var logger = require("./logger");
var { setupLoggers } = require("./utils");
var leven = require("leven");

program.version(pkg.version);
program.option(
  "-P, --project <alias_or_project_id>",
  "the Firebase project to use for this command"
);
program.option("-j, --json", "output JSON instead of text, also triggers non-interactive mode");
program.option("--token <token>", "supply an auth token for this command");
program.option("--non-interactive", "error out of the command instead of waiting for prompts");
program.option("-i, --interactive", "force prompts to be displayed");
program.option("--debug", "print verbose debug output and keep a debug log file");
program.option("-c, --config <path>", "path to the firebase.json file to use for configuration");

var client = {};
client.cli = program;
client.logger = require("./logger");
client.errorOut = require("./errorOut").errorOut;
client.getCommand = function(name) {
  for (var i = 0; i < client.cli.commands.length; i++) {
    if (client.cli.commands[i]._name === name) {
      return client.cli.commands[i];
    }
  }
  return null;
};

require("./commands")(client);

/**
 * Checks to see if there is a different command similar to the provided one.
 * This prints the suggestion and returns it if there is one.
 * @param {string} cmd The command as provided by the user.
 * @param {string[]} cmdList List of commands available in the CLI.
 * @return {string|undefined} Returns the suggested command; undefined if none.
 */
function suggestCommands(cmd, cmdList) {
  var suggestion = cmdList.find(function(c) {
    return leven(c, cmd) < c.length * 0.4;
  });
  if (suggestion) {
    logger.error();
    logger.error("Did you mean " + clc.bold(suggestion) + "?");
    return suggestion;
  }
}

var commandNames = program.commands.map(function(cmd) {
  return cmd._name;
});

var RENAMED_COMMANDS = {
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
program.action(function(_, args) {
  setupLoggers();

  var cmd = args[0];
  logger.error(clc.bold.red("Error:"), clc.bold(cmd), "is not a Firebase command");

  if (RENAMED_COMMANDS[cmd]) {
    logger.error();
    logger.error(
      clc.bold(cmd) + " has been renamed, please run",
      clc.bold("firebase " + RENAMED_COMMANDS[cmd]),
      "instead"
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

module.exports = client;
