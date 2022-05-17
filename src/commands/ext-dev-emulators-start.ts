import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import { logger } from "../logger";

module.exports = new Command("ext:dev:emulators:start")
  .description("start the local Firebase extension emulator")
  .before(commandUtils.setExportOnExitOptions)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_TEST_CONFIG, commandUtils.DESC_TEST_CONFIG)
  .option(commandUtils.FLAG_TEST_PARAMS, commandUtils.DESC_TEST_PARAMS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .action((options: any) => {
    const localInstallCommand = `firebase ext:install ${options.cwd}`;
    const emulatorsStartCommand = "firebase emulators:start";
    logger.error(
      "ext:dev:emulators:start is no longer supported. " +
        "Instead, navigate to a Firebase project directory and add this extension to the extensions manifest by running:\n" +
        localInstallCommand +
        "\nThen, you can emulate this extension as part of that project by running:\n" +
        emulatorsStartCommand
    );
  });
