"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var requireConfig = require("../lib/requireConfig");
var scopes = require("../lib/scopes");
var action = require("../lib/functionsShellCommandAction");

module.exports = new Command("functions:shell")
  .description("launch full Node shell with emulated functions")
  .option("-p, --port <port>", "the port on which to emulate functions (default: 5000)", 5000)
  .before(requireConfig)
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(action);
