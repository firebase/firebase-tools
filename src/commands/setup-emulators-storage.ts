import { Command } from "../command";
import { downloadEmulator } from "../emulator/download";
import { DownloadableEmulators } from "../emulator/types";

const EMULATOR_NAME = "storage";

module.exports = new Command(`setup:emulators:${EMULATOR_NAME}`)
  .description(`downloads the ${EMULATOR_NAME} emulator`)
  .action(() => {
    return downloadEmulator(EMULATOR_NAME as DownloadableEmulators);
  });
