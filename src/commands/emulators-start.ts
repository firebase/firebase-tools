import * as Command from "../command";
import * as controller from "../emulator/controller";
import getProjectNumber = require("../getProjectNumber");
import requireAuth = require("../requireAuth");
import requireConfig = require("../requireConfig");

module.exports = new Command("emulators:start")
  .before(async (options: any) => {
    await requireConfig(options);
    await requireAuth(options);
    await getProjectNumber(options);
  })
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
