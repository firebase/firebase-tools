import { Command } from "../command";
import * as controller from "../emulator/controller";
import { beforeEmulatorCommand, Flags } from "../emulator/commandUtils";
import * as utils from "../utils";

module.exports = new Command("emulators:start")
  .before(beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(Flags.FLAG_ONLY, Flags.DESC_ONLY)
  .option(Flags.FLAG_INSPECT_FUNCTIONS, Flags.DESC_INSPECT_FUNCTIONS)
  .action(async (options: any) => {
    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    utils.logSuccess("All emulators started, it is now safe to connect.");

    // Hang until explicitly killed
    await new Promise((res, rej) => {
      process.on("SIGINT", () => {
        controller
          .cleanShutdown()
          .then(res)
          .catch(res);
      });
    });
  });
