// TODO(joehanley): Remove this entire command in v12.
import * as clc from "colorette";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as commandUtils from "../emulator/commandUtils";

export const command = new Command("ext:dev:emulators:exec <script>")
  .description("deprecated: please use `firebase emulators:exec` instead")
  .before(commandUtils.setExportOnExitOptions)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_TEST_CONFIG, commandUtils.DESC_TEST_CONFIG)
  .option(commandUtils.FLAG_TEST_PARAMS, commandUtils.DESC_TEST_PARAMS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .option(commandUtils.FLAG_UI, commandUtils.DESC_UI)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action((script: string) => {
    const localInstallCommand = `firebase ext:install ${process.cwd()}`;
    const emulatorsExecCommand = `firebase emulators:exec '${script}`;
    throw new FirebaseError(
      "ext:dev:emulators:exec is no longer supported. " +
        "Instead, navigate to a Firebase project directory and add this extension to the extensions manifest by running:\n" +
        clc.bold(localInstallCommand) +
        "\nThen, you can emulate this extension as part of that project by running:\n" +
        clc.bold(emulatorsExecCommand)
    );
  });
