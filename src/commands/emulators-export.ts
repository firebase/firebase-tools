import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";

const COMMAND_NAME = "emulators:export";
export const command = new Command(`${COMMAND_NAME} <path>`)
  .description("export data from running emulators")
  .withForce("overwrite any export data in the target directory")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action((exportPath: string, options: any) => {
    return controller.exportEmulatorData(exportPath, options, /* initiatedBy= */ COMMAND_NAME);
  });
