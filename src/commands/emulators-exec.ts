import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";

module.exports = new Command("emulators:exec <script>")
  .before(commandUtils.setExportOnExitOptions)
  .before(commandUtils.beforeEmulatorCommand)
  .description(
    "start the local Firebase emulators, " + "run a test script, then shut down the emulators"
  )
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .option(commandUtils.FLAG_UI, commandUtils.DESC_UI)
  .action(commandUtils.emulatorExec);
