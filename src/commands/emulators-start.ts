import * as Command from "../command";
import * as controller from "../emulator/controller";
import { beforeEmulatorCommand } from "../emulator/commandUtils";
import * as utils from "../utils";

module.exports = new Command("emulators:start")
  .before(beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(
    "--only <list>",
    "only run specific emulators. " +
      "This is a comma separated list of emulators to start. " +
      "Valid options are: " +
      JSON.stringify(controller.VALID_EMULATOR_STRINGS)
  )
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
