"use strict";

var program = require("commander");
var pkg = require("../package.json");
var clc = require("cli-color");
var logger = require("./logger");
var didYouMean = require("didyoumean");

program.version(pkg.version);
program.option(
  "-P, --project <alias_or_project_id>",
  "the Firebase project to use for this command"
);
program.option("-j, --json", "output JSON instead of text, also triggers non-interactive mode");
program.option("--token <token>", "supply an auth token for this command");
program.option("--non-interactive", "error out of the command instead of waiting for prompts");
program.option("--interactive", "force interactive shell treatment even when not detected");
program.option("--debug", "print verbose debug output and keep a debug log file");
// program.option('-d, --debug', 'display debug information and keep firebase-debug.log');

var client = {};
client.cli = program;
client.logger = require("./logger");
client.errorOut = function(error, status) {
  require("./errorOut")(client, error, status);
};
client.getCommand = function(name) {
  for (var i = 0; i < client.cli.commands.length; i++) {
    if (client.cli.commands[i]._name === name) {
      return client.cli.commands[i];
    }
  }
  return null;
};

require("./commands")(client);

function suggestCommands(cmd, cmdList) {
  var suggestion = didYouMean(cmd, cmdList);
  if (suggestion) {
    logger.error();
    logger.error("Did you mean", clc.bold(suggestion) + "?");
    process.exit(1);
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

program.action(function(cmd, cmd2) {
  suggestCommands(cmd, commandNames);
  logger.error(clc.bold.red("Error:"), clc.bold(cmd), "is not a Firebase command");

  if (RENAMED_COMMANDS[cmd]) {
    logger.error();
    logger.error(
      clc.bold(cmd) + " has been renamed, please run",
      clc.bold("firebase " + RENAMED_COMMANDS[cmd]),
      "instead"
    );
  } else {
    if (!didYouMean(cmd, commandNames)) {
      cmd = [cmd, cmd2].join(":");
    }
    suggestCommands(cmd, commandNames);
  }

  process.exit(1);
});

module.exports = client;
