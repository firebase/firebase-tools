import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";

module.exports = new Command("emulators:export <path>")
  .description("export data from running emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option("--force", "Overwrite any export data in the target directory.")
  .action(controller.exportEmulatorData);
