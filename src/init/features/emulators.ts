import * as clc from "cli-color";
import * as _ from "lodash";
import * as utils from "../../utils";
import { prompt } from "../../prompt";
import { Emulators, ALL_SERVICE_EMULATORS, isDownloadableEmulator } from "../../emulator/types";
import { Constants } from "../../emulator/constants";
import { downloadIfNecessary } from "../../emulator/downloadableEmulators";

interface EmulatorsInitSelections {
  emulators?: Emulators[];
  download?: boolean;
}

export async function doSetup(setup: any, config: any) {
  const choices = ALL_SERVICE_EMULATORS.map((e) => {
    return {
      value: e,
      name: _.capitalize(e),
      checked: config && config.has(e),
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
          type: "input",
          name: "port",
          message: `Which port do you want to use for the ${clc.underline(selected)} emulator?`,
          default: Constants.getDefaultPort(selected as Emulators),
        },
      ]);
    }
  }

  if (selections.emulators.length) {
    await prompt(selections, [
      {
        name: "download",
        type: "confirm",
        message: "Would you like to download the emulators now?",
        default: false,
      },
    ]);
  }

  if (selections.download) {
    for (const selected of selections.emulators) {
      if (isDownloadableEmulator(selected)) {
        await downloadIfNecessary(selected);
      }
    }
  }
}
