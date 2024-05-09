import * as clc from "colorette";
import * as _ from "lodash";
import * as utils from "../../utils";
import { prompt, promptOnce } from "../../prompt";
import { Emulators, ALL_SERVICE_EMULATORS, isDownloadableEmulator } from "../../emulator/types";
import { Constants } from "../../emulator/constants";
import { downloadIfNecessary } from "../../emulator/downloadableEmulators";
import { Setup } from "../index";

interface EmulatorsInitSelections {
  emulators?: Emulators[];
  download?: boolean;
}

// postgresql://localhost:5432 is a default out of the box value for most installations of Postgres
export const DEFAULT_POSTGRES_CONNECTION = "postgresql://localhost:5432?sslmode=disable";

export async function doSetup(setup: Setup, config: any) {
  const choices = ALL_SERVICE_EMULATORS.map((e) => {
    return {
      value: e,
      name: Constants.description(e),
      checked: config && (config.has(e) || config.has(`emulators.${e}`)),
    };
  });

  const selections: EmulatorsInitSelections = {};
  await prompt(selections, [
    {
      type: "checkbox",
      name: "emulators",
      message:
        "Which Firebase emulators do you want to set up? " +
        "Press Space to select emulators, then Enter to confirm your choices.",
      choices: choices,
    },
  ]);

  if (!selections.emulators) {
    return;
  }

  setup.config.emulators = setup.config.emulators || {};
  for (const selected of selections.emulators) {
    setup.config.emulators[selected] = setup.config.emulators[selected] || {};

    const currentPort = setup.config.emulators[selected].port;
    if (currentPort) {
      utils.logBullet(`Port for ${selected} already configured: ${clc.cyan(currentPort)}`);
    } else {
      await prompt(setup.config.emulators[selected], [
        {
          type: "number",
          name: "port",
          message: `Which port do you want to use for the ${clc.underline(selected)} emulator?`,
          default: Constants.getDefaultPort(selected as Emulators),
        },
      ]);
    }
  }

  if (selections.emulators.length) {
    const uiDesc = Constants.description(Emulators.UI);
    if (setup.config.emulators.ui && setup.config.emulators.ui.enabled !== false) {
      const currentPort = setup.config.emulators.ui.port || "(automatic)";
      utils.logBullet(`${uiDesc} already enabled with port: ${clc.cyan(currentPort)}`);
    } else {
      const ui = setup.config.emulators.ui || {};
      setup.config.emulators.ui = ui;

      await prompt(ui, [
        {
          name: "enabled",
          type: "confirm",
          message: `Would you like to enable the ${uiDesc}?`,
          default: true,
        },
      ]);

      if (ui.enabled) {
        await prompt(ui, [
          {
            type: "input",
            name: "port",
            message: `Which port do you want to use for the ${clc.underline(
              uiDesc,
            )} (leave empty to use any available port)?`,
          },
        ]);

        // Parse the input as a number
        const portNum = Number.parseInt(ui.port);
        ui.port = isNaN(portNum) ? undefined : portNum;
      }
    }

    if (selections.emulators.includes(Emulators.DATACONNECT)) {
      const defaultConnectionString =
        setup.rcfile.dataconnectEmulatorConfig?.postgres?.localConnectionString ??
        DEFAULT_POSTGRES_CONNECTION;
      // TODO: Download Postgres
      const localConnectionString = await promptOnce({
        type: "input",
        name: "localConnectionString",
        message: `What is the connection string of the local Postgres instance you would like to use with the Data Connect emulator?`,
        default: defaultConnectionString,
      });
      setup.rcfile.dataconnectEmulatorConfig = { postgres: { localConnectionString } };
    }

    await prompt(selections, [
      {
        name: "download",
        type: "confirm",
        message: "Would you like to download the emulators now?",
        default: true,
      },
    ]);
  }

  // Set the default behavior to be single project mode.
  if (setup.config.emulators.singleProjectMode === undefined) {
    setup.config.emulators.singleProjectMode = true;
  }

  if (selections.download) {
    for (const selected of selections.emulators) {
      if (isDownloadableEmulator(selected)) {
        await downloadIfNecessary(selected);
      }
    }

    if (_.get(setup, "config.emulators.ui.enabled")) {
      downloadIfNecessary(Emulators.UI);
    }
  }
}
