"use strict";

const { Command } = require("../command");
const downloadEmulator = require("../emulator/download");

const NAME = "firestore";

module.exports = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action((options) => {
    return downloadEmulator(NAME);
  });
