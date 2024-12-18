import { Command } from "../command.js";
import { Emulators } from "../emulator/types.js";
import { Options } from "../options.js";
import { logger } from "../logger.js";
import { downloadIfNecessary } from "../emulator/downloadableEmulators.js";

const NAME = Emulators.DATACONNECT;

export const command = new Command(`setup:emulators:${NAME}`)
  .description(`downloads the ${NAME} emulator`)
  .action(async (options: Options) => {
    await downloadIfNecessary(NAME);
    if (!options.config) {
      logger.info(
        "Not currently in a Firebase project directory. Run this command from a project directory to configure the Data Connect emulator.",
      );
      return;
    }
    logger.info("Setup complete!");
  });
