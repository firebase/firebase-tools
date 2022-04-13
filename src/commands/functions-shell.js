"use strict";

var { Command } = require("../command");
var { requirePermissions } = require("../requirePermissions");
var { actionFunction } = require("../functionsShellCommandAction");
var { requireConfig } = require("../requireConfig");
var commandUtils = require("../emulator/commandUtils");

module.exports = new Command("functions:shell")
  .description("launch full Node shell with emulated functions")
  .option("-p, --port <port>", "the port on which to emulate functions")
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .before(requireConfig)
  .before(requirePermissions)
  .action(actionFunction);
