"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const prompt_1 = require("../../prompt");
const fsutils = require("../../fsutils");
const clc = require("colorette");
/**
 * Function retrieves names for parameters and parameter groups
 * @param setup Input is of RemoteConfigSetup defined in interfaces above
 * @param config Input is of type Config
 * @return {Promise} Returns a promise and writes the project file for remoteconfig template when initializing
 */
async function doSetup(setup, config) {
    const jsonFilePath = await (0, prompt_1.input)({
        message: "What file should be used for your Remote Config template?",
        default: "remoteconfig.template.json",
    });
    if (fsutils.fileExistsSync(jsonFilePath)) {
        const msg = "File " +
            clc.bold(jsonFilePath) +
            " already exists." +
            " Do you want to overwrite the existing Remote Config template?";
        const overwrite = await (0, prompt_1.confirm)(msg);
        if (!overwrite) {
            return;
        }
    }
    setup.config.remoteconfig = {
        template: jsonFilePath,
    };
    config.writeProjectFile(setup.config.remoteconfig.template, "{}");
}
exports.doSetup = doSetup;
