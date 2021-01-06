import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import * as logger from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators, EMULATORS_SUPPORTED_BY_UI } from "../emulator/types";
import * as clc from "cli-color";
import { Constants } from "../emulator/constants";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Table = require("cli-table");

function stylizeLink(url: string): string {
  return clc.underline(clc.bold(url));
}

module.exports = new Command("emulators:start")
  .before(commandUtils.setExportOnExitOptions)
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (options: any) => {
    const killSignalPromise = commandUtils.shutdownWhenKilled(options);

    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    const reservedPorts = [] as number[];
    for (const internalEmulator of [Emulators.LOGGING]) {
      const info = EmulatorRegistry.getInfo(internalEmulator);
      if (info) {
        reservedPorts.push(info.port);
      }
    }
    const uiInfo = EmulatorRegistry.getInfo(Emulators.UI);
    const hubInfo = EmulatorRegistry.getInfo(Emulators.HUB);
    const uiUrl = uiInfo ? `http://${EmulatorRegistry.getInfoHostString(uiInfo)}` : "unknown";
    const head = ["Emulator", "Host:Port"];

    if (uiInfo) {
      head.push(`View in ${Constants.description(Emulators.UI)}`);
    }

    const successMessageTable = new Table();
    let successMsg = `${clc.green("✔")}  ${clc.bold(
      "All emulators ready! It is now safe to connect your app."
    )}`;
    if (uiInfo) {
      successMsg += `\n${clc.cyan("i")}  View Emulator UI at ${stylizeLink(uiUrl)}`;
    }
    successMessageTable.push([successMsg]);

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
          const info = EmulatorRegistry.getInfo(emulator);
          const emulatorName = Constants.description(emulator).replace(/ emulator/i, "");
          const isSupportedByUi = EMULATORS_SUPPORTED_BY_UI.includes(emulator);

          if (!info) {
            return [emulatorName, "Failed to initialize (see above)", "", ""];
          }

          return [
            emulatorName,
            EmulatorRegistry.getInfoHostString(info),
            isSupportedByUi && uiInfo
              ? stylizeLink(`${uiUrl}/${emulator}`)
              : clc.blackBright("n/a"),
          ];
        })
        .map((col) => col.slice(0, head.length))
        .filter((v) => v)
    );

    logger.info(`\n${successMessageTable}

${emulatorsTable}
${
  hubInfo
    ? clc.blackBright("  Emulator Hub running at ") + EmulatorRegistry.getInfoHostString(hubInfo)
    : clc.blackBright("  Emulator Hub not running.")
}
${clc.blackBright("  Other reserved ports:")} ${reservedPorts.join(", ")}

Issues? Report them at ${stylizeLink(
      "https://github.com/firebase/firebase-tools/issues"
    )} and attach the *-debug.log files.
 `);

    // Add this line above once connect page is implemented
    // It is now safe to connect your app. Instructions: http://${uiInfo?.host}:${uiInfo?.port}/connect

    // Hang until explicitly killed
    await killSignalPromise;
  });
