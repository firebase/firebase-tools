import { Command } from "../command";

import * as commandUtils from "../emulator/commandUtils";
import * as optionsHelper from "../extensions/emulator/optionsHelper";

module.exports = new Command("ext:dev:emulators:exec <script>")
  .description("emulate an extension, run a test script, then shut down the emulators")
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_TEST_CONFIG, commandUtils.DESC_TEST_CONFIG)
  .option(commandUtils.FLAG_TEST_PARAMS, commandUtils.DESC_TEST_PARAMS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .action(async (script: string, options: any) => {
    const emulatorOptions = await optionsHelper.buildOptions(options);
    commandUtils.beforeEmulatorCommand(emulatorOptions);
    await commandUtils.emulatorExec(script, emulatorOptions);
  });
