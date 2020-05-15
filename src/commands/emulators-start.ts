import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import * as logger from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators, EMULATORS_SUPPORTED_BY_GUI } from "../emulator/types";
import * as clc from "cli-color";

const Table = require("cli-table");

function stylizeLink(url: String) {
  return clc.underline(clc.bold(url));
}

module.exports = new Command("emulators:start")
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .action(async (options: any) => {
    const killSignalPromise = commandUtils.shutdownWhenKilled();

    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    const guiInfo = EmulatorRegistry.getInfo(Emulators.GUI);
    const guiUrl = `http://${guiInfo?.host}:${guiInfo?.port}`;
    const head = ["Emulator", "Host:Port"];

    if (guiInfo) {
      head.push("View in UI");
    }

    const successMessageTable = new Table();
    successMessageTable.push([
      `${clc.green("✔")}  All emulators ready! ` +
        (guiInfo
          ? `View status and logs at ${stylizeLink(guiUrl)}`
          : `It is now safe to connect your apps.`),
    ]);

    const emulatorsTable = new Table({
      head: head,
      style: {
        head: ["yellow"],
      },
    });

    emulatorsTable.push(
      ...controller
        .filterEmulatorTargets(options)
        .map((emulator) => {
          const instance = EmulatorRegistry.get(emulator);
          const info = EmulatorRegistry.getInfo(emulator);
          const emulatorName = emulator.slice(0, 1).toUpperCase() + emulator.slice(1);
          const isSupportedByGUI = EMULATORS_SUPPORTED_BY_GUI.includes(emulator);

          if (!info) {
            return [emulatorName, "Failed to initialize (see above)", "", ""];
          }

          return [
            emulatorName,
            `${info?.host}:${info?.port}`,
            isSupportedByGUI && guiInfo
              ? stylizeLink(`${guiUrl}/${emulator}`)
              : clc.blackBright("n/a"),
          ];
        })
        .map((col) => col.slice(0, head.length))
        .filter((v) => v)
    );

    logger.info(`\n${successMessageTable}

${emulatorsTable}
${clc.blackBright("  Other reserved ports:")} ${EmulatorRegistry.getInfo(Emulators.HUB)?.port}

Issues? Report them at ${stylizeLink(
      "https://github.com/firebase/firebase-tools/issues"
    )} and attach the *-debug.log files.
 `);

    // Add this line above once connect page is implemented
    // It is now safe to connect your app. Instructions: http://${guiInfo?.host}:${guiInfo?.port}/connect

    // Hang until explicitly killed
    await killSignalPromise;
  });
