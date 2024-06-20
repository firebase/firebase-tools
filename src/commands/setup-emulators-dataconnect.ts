import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { Options } from "../options";
import { DEFAULT_POSTGRES_CONNECTION } from "../init/features/emulators";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { downloadIfNecessary } from "../emulator/downloadableEmulators";

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

    if (!options.nonInteractive) {
      const dataconnectEmulatorConfig = options.rc.getDataconnect();
      const defaultConnectionString =
        dataconnectEmulatorConfig?.postgres?.localConnectionString ?? DEFAULT_POSTGRES_CONNECTION;
      // TODO: Download Postgres
      const localConnectionString = await promptOnce({
        type: "input",
        name: "localConnectionString",
        message: `What is the connection string of the local Postgres instance you would like to use with the Data Connect emulator?`,
        default: defaultConnectionString,
      });
      options.rc.setDataconnect(localConnectionString);
    }
    logger.info("Setup complete!");
  });
