"use strict";
/**
 * Webhook send API used to notify VSCode of states within
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVSCodeMessage = exports.port = exports.DEFAULT_PORT = exports.VSCODE_MESSAGE = void 0;
const node_fetch_1 = require("node-fetch");
const logger_1 = require("../logger");
var VSCODE_MESSAGE;
(function (VSCODE_MESSAGE) {
    VSCODE_MESSAGE["EMULATORS_STARTED"] = "EMULATORS_STARTED";
    VSCODE_MESSAGE["EMULATORS_START_ERRORED"] = "EMULATORS_START_ERRORED";
    VSCODE_MESSAGE["EMULATORS_SHUTDOWN"] = "EMULATORS_SHUTDOWN";
})(VSCODE_MESSAGE = exports.VSCODE_MESSAGE || (exports.VSCODE_MESSAGE = {}));
exports.DEFAULT_PORT = "40001"; // 5 digit default used by vscode;
// If port in use, VSCode will pass a different port to the integrated term through env var
exports.port = process.env.VSCODE_WEBHOOK_PORT || exports.DEFAULT_PORT;
async function sendVSCodeMessage(body) {
    const jsonBody = JSON.stringify(body);
    try {
        return await (0, node_fetch_1.default)(`http://localhost:${exports.port}/vscode/notify`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "x-mantle-admin": "all",
            },
            body: jsonBody,
            signal: AbortSignal.timeout(3000), // necessary due to https://github.com/node-fetch/node-fetch/issues/1652
        });
    }
    catch (e) {
        logger_1.logger.debug(`Could not find VSCode notification endpoint: ${e}. If you are not running the Firebase Data Connect VSCode extension, this is expected and not an issue.`);
    }
}
exports.sendVSCodeMessage = sendVSCodeMessage;
