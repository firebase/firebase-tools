import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";

module.exports = new Command("emulators:export <path>")
  .description("export data from running emulators")
  .withForce("overwrite any export data in the target directory")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .action(controller.exportEmulatorData);
