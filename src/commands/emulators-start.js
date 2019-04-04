"use strict";

var clc = require("cli-color");
var _ = require("lodash");

var Command = require("../command");
var logger = require("../logger");
var utils = require("../utils");
var requirePermissions = require("../requirePermissions");
var requireConfig = require("../requireConfig");
var checkDupHostingKeys = require("../checkDupHostingKeys");
var serve = require("../serve/index");
var filterTargets = require("../filterTargets");
var getProjectNumber = require("../getProjectNumber");
var javaEmulator = require("../serve/javaEmulators");

var VALID_EMULATORS = ["database", "firestore", "functions"];

module.exports = new Command("emulators:start")
  .description("start your local emulators")
  .option(
    "--firestore-host <hostname>",
    "the hostname to bind the firestore emulator to"
  )
  .option(
    "--firestore-port <port_number>",
    "the port to bind the firestore emulator to"
  )
  .option(
    "--functions-host <hostname>",
    "the hostname to bind the functions emulator to"
  )
  .option("--functions-port <port_number>")
  .action(async (options) => {
    // TODO(rpb): figure out which emulators to start
    // TODO(rpb): start the functions emulator
    // TODO(rpb): pass in command line options to the emulators
    await javaEmulator.start("firestore");
  });
