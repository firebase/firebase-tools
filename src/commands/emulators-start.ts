import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import { logger } from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators, EMULATORS_SUPPORTED_BY_UI } from "../emulator/types";
import * as clc from "colorette";
import { Constants } from "../emulator/constants";
import { logLabeledWarning } from "../utils";
import { ExtensionsEmulator } from "../emulator/extensionsEmulator";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Table = require("cli-table");

function stylizeLink(url: string): string {
  return clc.underline(clc.bold(url));
}

export const command = new Command("emulators:start")
  .before(commandUtils.setExportOnExitOptions)
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .option(commandUtils.FLAG_VERBOSITY, commandUtils.DESC_VERBOSITY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action((options: any) => {
    const killSignalPromise = commandUtils.shutdownWhenKilled(options);
    return Promise.race([
      killSignalPromise,
      (async () => {
        let deprecationNotices;
        try {
          ({ deprecationNotices } = await controller.startAll(options));
        } catch (e: any) {
          await controller.cleanShutdown();
          throw e;
        }

        printEmulatorOverview(options);

        for (const notice of deprecationNotices) {
          logLabeledWarning("emulators", notice, "warn");
        }

        // Hang until explicitly killed
        return killSignalPromise;
      })(),
    ]);
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printEmulatorOverview(options: any): void {
  const reservedPorts = [] as number[];
  for (const internalEmulator of [Emulators.LOGGING]) {
    const info = EmulatorRegistry.getInfo(internalEmulator);
    if (info) {
      reservedPorts.push(info.port);
    }
    controller.filterEmulatorTargets(options).forEach((emulator: Emulators) => {
      reservedPorts.push(...(EmulatorRegistry.getInfo(emulator)?.reservedPorts || []));
    });
  }
  const reservedPortsString = reservedPorts.length > 0 ? reservedPorts.join(", ") : "None";

  const uiRunning = EmulatorRegistry.isRunning(Emulators.UI);
  const head = ["Emulator", "Host:Port"];

  if (uiRunning) {
    head.push(`View in ${Constants.description(Emulators.UI)}`);
  }

  const successMessageTable = new Table();
  let successMsg = `${clc.green("✔")}  ${clc.bold(
    "All emulators ready! It is now safe to connect your app.",
  )}`;
  if (uiRunning) {
    successMsg += `\n${clc.cyan("i")}  View Emulator UI at ${stylizeLink(
      EmulatorRegistry.url(Emulators.UI).toString(),
    )}`;
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
        const emulatorName = Constants.description(emulator).replace(/ emulator/i, "");
        const isSupportedByUi = EMULATORS_SUPPORTED_BY_UI.includes(emulator);
        const listen = commandUtils.getListenOverview(emulator);
        if (!listen) {
          const row = [emulatorName, "Failed to initialize (see above)"];
          if (uiRunning) {
            row.push("");
          }
          return row;
        }
        let uiLink = "n/a";
        if (isSupportedByUi && uiRunning) {
          const url = EmulatorRegistry.url(Emulators.UI);
          url.pathname = `/${emulator}`;
          uiLink = stylizeLink(url.toString());
        }

        return [emulatorName, listen, uiLink];
      })
      .map((col) => col.slice(0, head.length))
      .filter((v) => v),
  );
  let extensionsTable = "";
  if (EmulatorRegistry.isRunning(Emulators.EXTENSIONS)) {
    const extensionsEmulatorInstance = EmulatorRegistry.get(
      Emulators.EXTENSIONS,
    ) as ExtensionsEmulator;
    extensionsTable = extensionsEmulatorInstance.extensionsInfoTable(options);
  }
  logger.info(`\n${successMessageTable}

${emulatorsTable}
${
  EmulatorRegistry.isRunning(Emulators.HUB)
    ? clc.blackBright("  Emulator Hub running at ") + EmulatorRegistry.url(Emulators.HUB).host
    : clc.blackBright("  Emulator Hub not running.")
}
${clc.blackBright("  Other reserved ports:")} ${reservedPortsString}
${extensionsTable}
Issues? Report them at ${stylizeLink(
    "https://github.com/firebase/firebase-tools/issues",
  )} and attach the *-debug.log files.
 `);

  // Add this line above once connect page is implemented
  // It is now safe to connect your app. Instructions: http://${uiInfo?.host}:${uiInfo?.port}/connect
}
