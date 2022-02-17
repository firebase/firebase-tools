import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { Emulators } from "../emulator/types";

const EMULATOR_NAME = Emulators.PUBSUB;

export default new Command(`setup:emulators:${EMULATOR_NAME}`)
  .description(`downloads the ${EMULATOR_NAME} emulator`)
  .action(() => {
    return downloadEmulator(EMULATOR_NAME);
  });
