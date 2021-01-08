"use strict";

const { Command } = require("../command");
const { Emulators } = require("../emulator/types");
const { downloadEmulator } = require("../emulator/download");

const NAME = Emulators.DATABASE;

module.exports = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action((options) => {
    return downloadEmulator(NAME);
  });
