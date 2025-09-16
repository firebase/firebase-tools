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
const prompt_1 = require("../../prompt");
const fsutils = __importStar(require("../../fsutils"));
const clc = __importStar(require("colorette"));
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
//# sourceMappingURL=remoteconfig.js.map