import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { Emulators } from "../emulator/types";

const NAME = Emulators.UI;

export default new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action(() => {
    return downloadEmulator(NAME);
  });
