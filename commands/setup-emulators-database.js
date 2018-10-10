"use strict";

const Command = require("../lib/command");
const downloadEmulator = require("../lib/emulator/download");

const name = "database";

module.exports = new Command("setup:emulators:" + name)
  .description("downloads the " + name + " emulator")
  .action(downloadEmulator.bind(this, name));
