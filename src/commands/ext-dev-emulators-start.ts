// TODO(joehanley): Remove this entire command in v12.
import * as clc from "colorette";
import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import { FirebaseError } from "../error";

export const command = new Command("ext:dev:emulators:start")
  .description("deprecated: please use `firebase emulators:start`")
  .before(commandUtils.setExportOnExitOptions)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_TEST_CONFIG, commandUtils.DESC_TEST_CONFIG)
  .option(commandUtils.FLAG_TEST_PARAMS, commandUtils.DESC_TEST_PARAMS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .action(() => {
    const localInstallCommand = `firebase ext:install ${process.cwd()}`;
    const emulatorsStartCommand = "firebase emulators:start";
    throw new FirebaseError(
      "ext:dev:emulators:start is no longer supported. " +
        "Instead, navigate to a Firebase project directory and add this extension to the extensions manifest by running:\n" +
        clc.bold(localInstallCommand) +
        "\nThen, you can emulate this extension as part of that project by running:\n" +
        clc.bold(emulatorsStartCommand)
    );
  });
