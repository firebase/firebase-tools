import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { Emulators } from "../emulator/types";

const NAME = Emulators.FIRESTORE;

export const command = new Command(`setup:emulators:${NAME}`)
  .description(`download the ${NAME} emulator`)
  .action(() => {
    return downloadEmulator(NAME);
  });
