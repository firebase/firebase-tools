import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import * as utils from "../utils";
import * as logger from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators, EMULATORS_SUPPORTED_BY_GUI } from "../emulator/types";
const Table = require("cli-table");

module.exports = new Command("emulators:start")
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .action(async (options: any) => {
    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    utils.logLabeledSuccess("emulators", "All emulators started, it is now safe to connect.");
    const table = new Table({
      head: ["Emulator", "Host:Port", "View in Browser"],
      style: {
        head: ["yellow"],
      },
    });

    const guiInfo = EmulatorRegistry.getInfo(Emulators.GUI);
    table.push(
      ...controller
        .filterEmulatorTargets(options)
        .map((emulator) => {
          const info = EmulatorRegistry.getInfo(emulator);
          const emulatorName = emulator.slice(0, 1).toUpperCase() + emulator.slice(1);
          const isSupportedByGUI = EMULATORS_SUPPORTED_BY_GUI.includes(emulator);

          if (!info) {
            return [emulatorName, "Failed to initialize (see above)", ""];
          }

          return [
            emulatorName,
            `${info?.host}:${info?.port}`,
            isSupportedByGUI && guiInfo ? `http://${guiInfo.host}:${guiInfo.port}/${emulator}` : "",
          ];
        })
        .filter((v) => v)
    );

    logger.info(`${table.toString()}
 
You can also view status and logs of the emulators by pointing your browser to http://${
      guiInfo?.host
    }:${guiInfo?.port}/.
 
Issues? Report them at https://github.com/firebase/firebase-tools/issues and attach log files named *-debug.log in current directory.
 `);

    // Add this line above once connect page is implemented
    // It is now safe to connect your app. Instructions: http://${guiInfo?.host}:${guiInfo?.port}/connect

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
