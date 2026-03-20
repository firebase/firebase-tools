import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { Emulators } from "../emulator/types";

const EMULATOR_NAME = Emulators.PUBSUB;

export const command = new Command(`setup:emulators:${EMULATOR_NAME}`)
  .description(`download the ${EMULATOR_NAME} emulator`)
  .action(() => {
    return downloadEmulator(EMULATOR_NAME);
  });
