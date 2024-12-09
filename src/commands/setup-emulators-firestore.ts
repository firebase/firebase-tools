import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { Emulators } from "../emulator/types";

const NAME = Emulators.FIRESTORE;

export const command = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .firebaseNotRequired()
  .action(() => {
    return downloadEmulator(NAME);
  });
