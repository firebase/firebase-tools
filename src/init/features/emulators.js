"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const clc = __importStar(require("colorette"));
const utils = __importStar(require("../../utils"));
const prompt_1 = require("../../prompt");
const types_1 = require("../../emulator/types");
const constants_1 = require("../../emulator/constants");
const downloadableEmulators_1 = require("../../emulator/downloadableEmulators");
const initEmulators_1 = require("../../emulator/initEmulators");
async function doSetup(setup, config) {
    const choices = types_1.ALL_SERVICE_EMULATORS.map((e) => {
        return {
            value: e,
            // TODO: latest versions of inquirer have a name vs description.
            // We should learn more and whether it's worth investing in.
            name: constants_1.Constants.description(e),
            checked: config?.has(e) || config?.has(`emulators.${e}`),
        };
    });
    const selections = {};
    selections.emulators = await (0, prompt_1.checkbox)({
        message: "Which Firebase emulators do you want to set up? " +
            "Press Space to select emulators, then Enter to confirm your choices.",
        choices: choices,
    });
    if (!selections.emulators) {
        return;
    }
    setup.config.emulators = setup.config.emulators || {};
    const emulators = setup.config.emulators || {};
    for (const selected of selections.emulators) {
        if (selected === "extensions")
            continue;
        const selectedEmulator = emulators[selected] || {};
        const currentPort = selectedEmulator.port;
        if (currentPort) {
            utils.logBullet(`Port for ${selected} already configured: ${clc.cyan(currentPort)}`);
        }
        else {
            selectedEmulator.port = await (0, prompt_1.number)({
                message: `Which port do you want to use for the ${clc.underline(selected)} emulator?`,
                default: constants_1.Constants.getDefaultPort(selected),
            });
        }
        emulators[selected] = selectedEmulator;
        const additionalInitFn = initEmulators_1.AdditionalInitFns[selected];
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
        const uiDesc = constants_1.Constants.description(types_1.Emulators.UI);
        if (setup.config.emulators.ui && setup.config.emulators.ui.enabled !== false) {
            const currentPort = setup.config.emulators.ui.port || "(automatic)";
            utils.logBullet(`${uiDesc} already enabled with port: ${clc.cyan(currentPort)}`);
        }
        else {
            const ui = setup.config.emulators.ui || {};
            setup.config.emulators.ui = ui;
            ui.enabled = await (0, prompt_1.confirm)({
                message: `Would you like to enable the ${uiDesc}?`,
                default: true,
            });
            if (ui.enabled) {
                ui.port = await (0, prompt_1.number)({
                    message: `Which port do you want to use for the ${clc.underline(uiDesc)} (leave empty to use any available port)?`,
                    required: false,
                });
            }
        }
        selections.download = await (0, prompt_1.confirm)({
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
            if ((0, types_1.isDownloadableEmulator)(selected)) {
                await (0, downloadableEmulators_1.downloadIfNecessary)(selected);
            }
        }
        if (setup?.config?.emulators?.ui?.enabled) {
            (0, downloadableEmulators_1.downloadIfNecessary)(types_1.Emulators.UI);
        }
    }
}
exports.doSetup = doSetup;
//# sourceMappingURL=emulators.js.map