"use strict";

var Command = require("../command");
var requirePermissions = require("../requirePermissions");
var requireConfig = require("../requireConfig");
var action = require("../functionsShellCommandAction");

module.exports = new Command("functions:shell")
  .description("launch full Node shell with emulated functions")
  .option("-p, --port <port>", "the port on which to emulate functions (default: 5000)", 5000)
  .before(requireConfig)
  .before(requirePermissions)
  .action(action);
