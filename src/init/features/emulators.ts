import * as clc from "colorette";
import * as utils from "../../utils";
import { confirm, checkbox, number } from "../../prompt";
import { Emulators, ALL_SERVICE_EMULATORS, isDownloadableEmulator } from "../../emulator/types";
import { Constants } from "../../emulator/constants";
import { downloadIfNecessary } from "../../emulator/downloadableEmulators";
import { Setup } from "../index";
import { AdditionalInitFns } from "../../emulator/initEmulators";
import { Config } from "../../config";
import { EmulatorsConfig } from "../../firebaseConfig";

interface EmulatorsInitSelections {
  emulators?: Emulators[];
  download?: boolean;
}

export async function doSetup(setup: Setup, config: Config) {
  const choices = ALL_SERVICE_EMULATORS.map((e) => {
    return {
      value: e,
      // TODO: latest versions of inquirer have a name vs description.
      // We should learn more and whether it's worth investing in.
      name: Constants.description(e),
      checked: config?.has(e) || config?.has(`emulators.${e}`),
    };
  });

  const selections: EmulatorsInitSelections = {};
  selections.emulators = await checkbox<Emulators>({
    message:
      "Which Firebase emulators do you want to set up? " +
      "Press Space to select emulators, then Enter to confirm your choices.",
    choices: choices,
  });

  if (!selections.emulators) {
    return;
  }

  setup.config.emulators = setup.config.emulators || {};
  const emulators: EmulatorsConfig = setup.config.emulators || {};
  for (const selected of selections.emulators) {
    if (selected === "extensions") continue;
    const selectedEmulator = emulators[selected] || {};

    const currentPort = selectedEmulator.port;
    if (currentPort) {
      utils.logBullet(`Port for ${selected} already configured: ${clc.cyan(currentPort)}`);
    } else {
      selectedEmulator.port = await number({
        message: `Which port do you want to use for the ${clc.underline(selected)} emulator?`,
        default: Constants.getDefaultPort(selected),
      });
    }
    emulators[selected] = selectedEmulator;

    const additionalInitFn = AdditionalInitFns[selected];
    if (additionalInitFn) {
      const additionalOptions = await additionalInitFn(config);
      if (additionalOptions) {
        emulators[selected] = {
          ...setup.config.emulators[selected],
          ...additionalOptions,
        };
      }
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

      ui.enabled = await confirm({
        message: `Would you like to enable the ${uiDesc}?`,
        default: true,
      });

      if (ui.enabled) {
        ui.port = await number({
          message: `Which port do you want to use for the ${clc.underline(uiDesc)} (leave empty to use any available port)?`,
          required: false,
        });
      }
    }

    selections.download = await confirm({
      message: "Would you like to download the emulators now?",
      default: true,
    });
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

    if (setup?.config?.emulators?.ui?.enabled) {
      downloadIfNecessary(Emulators.UI);
    }
  }
}
