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

export interface RequiredInfo {
  emulators: Emulators[];
  download: boolean;
  config: EmulatorsConfig;
}

export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  const choices = ALL_SERVICE_EMULATORS.map((e) => {
    return {
      value: e,
      name: Constants.description(e),
      checked: config?.has(e) || config?.has(`emulators.${e}`),
    };
  });

  const selectedEmulators = await checkbox<Emulators>({
    message:
      "Which Firebase emulators do you want to set up? " +
      "Press Space to select emulators, then Enter to confirm your choices.",
    choices: choices,
  });

  if (!selectedEmulators || !selectedEmulators.length) {
    return;
  }

  setup.featureInfo = setup.featureInfo || {};
  const emulatorsInfo: RequiredInfo = {
    emulators: selectedEmulators,
    config: {},
    download: false,
  };
  setup.featureInfo.emulators = emulatorsInfo;

  const newConfig = emulatorsInfo.config;
  const existingConfig = setup.config.emulators || {};

  for (const selected of selectedEmulators) {
    if (selected === "extensions") continue;
    newConfig[selected] = {};
    const currentPort = existingConfig[selected]?.port;
    if (currentPort) {
      utils.logBullet(`Port for ${selected} already configured: ${clc.cyan(currentPort)}`);
    } else {
      newConfig[selected]!.port = await number({
        message: `Which port do you want to use for the ${clc.underline(selected)} emulator?`,
        default: Constants.getDefaultPort(selected),
      });
    }

    const additionalInitFn = AdditionalInitFns[selected];
    if (additionalInitFn) {
      const additionalOptions = await additionalInitFn(config);
      if (additionalOptions) {
        Object.assign(newConfig[selected]!, additionalOptions);
      }
    }
  }

  if (selectedEmulators.length) {
    const uiDesc = Constants.description(Emulators.UI);
    const existingUiConfig = existingConfig.ui || {};
    newConfig.ui = {};

    let enableUi: boolean;
    if (existingUiConfig.enabled !== undefined) {
      utils.logBullet(`${uiDesc} already ${existingUiConfig.enabled ? "enabled" : "disabled"}.`);
      enableUi = existingUiConfig.enabled;
    } else {
      enableUi = await confirm({
        message: `Would you like to enable the ${uiDesc}?`,
        default: true,
      });
    }
    newConfig.ui.enabled = enableUi;

    if (newConfig.ui.enabled) {
      const currentPort = existingUiConfig.port;
      if (currentPort) {
        utils.logBullet(`Port for ${uiDesc} already configured: ${clc.cyan(currentPort)}`);
      } else {
        newConfig.ui.port = await number({
          message: `Which port do you want to use for the ${clc.underline(uiDesc)} (leave empty to use any available port)?`,
          required: false,
        });
      }
    }
  }

  if (selectedEmulators.length) {
    emulatorsInfo.download = await confirm({
      message: "Would you like to download the emulators now?",
      default: true,
    });
  }
}

export async function actuate(setup: Setup): Promise<void> {
  const emulatorsInfo = setup.featureInfo?.emulators;
  if (!emulatorsInfo) {
    return;
  }

  setup.config.emulators = setup.config.emulators || {};
  const emulatorsConfig = setup.config.emulators;

  // Merge the config from the questions into the main config.
  for (const emulatorName of Object.keys(emulatorsInfo.config)) {
    const key = emulatorName as keyof EmulatorsConfig;
    if (key === "ui") {
      emulatorsConfig.ui = { ...emulatorsConfig.ui, ...emulatorsInfo.config.ui };
    } else if (emulatorsInfo.config[key] && key !== "singleProjectMode") {
      emulatorsConfig[key] = { ...emulatorsConfig[key], ...emulatorsInfo.config[key] };
    }
  }

  // Set the default behavior to be single project mode.
  if (emulatorsConfig.singleProjectMode === undefined) {
    emulatorsConfig.singleProjectMode = true;
  }

  if (emulatorsInfo.download) {
    for (const selected of emulatorsInfo.emulators) {
      if (isDownloadableEmulator(selected)) {
        await downloadIfNecessary(selected);
      }
    }

    if (emulatorsConfig.ui?.enabled) {
      await downloadIfNecessary(Emulators.UI);
    }
  }
}
