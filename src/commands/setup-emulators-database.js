"use strict";

const { Command } = require("../command");
const downloadEmulator = require("../emulator/download");

const NAME = "database";

module.exports = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action((options) => {
    return downloadEmulator(NAME);
  });
