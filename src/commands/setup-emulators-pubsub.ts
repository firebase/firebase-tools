import { Command } from "../command.js";
import { downloadEmulator } from "../emulator/download.js";
import { Emulators } from "../emulator/types.js";

const EMULATOR_NAME = Emulators.PUBSUB;

export const command = new Command(`setup:emulators:${EMULATOR_NAME}`)
  .description(`downloads the ${EMULATOR_NAME} emulator`)
  .action(() => {
    return downloadEmulator(EMULATOR_NAME);
  });
