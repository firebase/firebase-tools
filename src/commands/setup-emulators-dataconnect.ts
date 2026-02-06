import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { Options } from "../options";
import { logger } from "../logger";
import { downloadIfNecessary } from "../emulator/downloadableEmulators";

const NAME = Emulators.DATACONNECT;

export const command = new Command(`setup:emulators:${NAME}`)
  .description(`download the ${NAME} emulator`)
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
