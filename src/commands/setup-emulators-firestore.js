"use strict";

const Command = require("../command");
const downloadEmulator = require("../emulator/download");

const name = "firestore";

module.exports = new Command("setup:emulators:" + name)
  .description("downloads the " + name + " emulator")
  .action(downloadEmulator.bind(this, name));
