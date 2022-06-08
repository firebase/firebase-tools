import { Command } from "../command.js";
import { downloadEmulator } from "../emulator/download.js";
import { Emulators } from "../emulator/types.js";

const NAME = Emulators.FIRESTORE;

export const command = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action(() => {
    return downloadEmulator(NAME);
  });
