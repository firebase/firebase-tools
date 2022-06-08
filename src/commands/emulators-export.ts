import { Command } from "../command.js";
import * as controller from "../emulator/controller.js";
import * as commandUtils from "../emulator/commandUtils.js";

export const command = new Command("emulators:export <path>")
  .description("export data from running emulators")
  .withForce("overwrite any export data in the target directory")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .action(controller.exportEmulatorData);
