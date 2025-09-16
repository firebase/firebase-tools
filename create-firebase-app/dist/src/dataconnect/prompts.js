"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptDeleteConnector = void 0;
const prompt_1 = require("../prompt");
const utils = require("../utils");
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
