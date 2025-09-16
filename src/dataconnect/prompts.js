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
exports.promptDeleteConnector = void 0;
const prompt_1 = require("../prompt");
const utils = __importStar(require("../utils"));
const client_1 = require("./client");
async function promptDeleteConnector(options, connectorName) {
    utils.logLabeledWarning("dataconnect", `Connector ${connectorName} exists but is not listed in dataconnect.yaml.`);
    const confirmDeletion = await (0, prompt_1.confirm)({
        default: false,
        message: `Do you want to delete ${connectorName}?`,
        force: options.force,
        nonInteractive: options.nonInteractive,
    });
    if (confirmDeletion) {
        await (0, client_1.deleteConnector)(connectorName);
        utils.logLabeledSuccess("dataconnect", `Connector ${connectorName} deleted`);
    }
}
exports.promptDeleteConnector = promptDeleteConnector;
//# sourceMappingURL=prompts.js.map