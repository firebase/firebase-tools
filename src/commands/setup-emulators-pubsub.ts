import { Command } from "../command";
const downloadEmulator = require("../emulator/download");

const EMULATOR_NAME = "pubsub";

module.exports = new Command(`setup:emulators:${EMULATOR_NAME}`)
  .description(`downloads the ${EMULATOR_NAME} emulator`)
  .action(() => {
    return downloadEmulator(EMULATOR_NAME);
  });
