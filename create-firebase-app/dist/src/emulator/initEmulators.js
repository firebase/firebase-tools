"use strict";
// specific initialization steps for an emulator
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdditionalInitFns = void 0;
const clc = require("colorette");
const path_1 = require("path");
const prompt_1 = require("../prompt");
const developmentServer_1 = require("./apphosting/developmentServer");
const emulatorLogger_1 = require("./emulatorLogger");
const types_1 = require("./types");
const config_1 = require("../apphosting/config");
const projectUtils_1 = require("../projectUtils");
const secrets_1 = require("../apphosting/secrets");
exports.AdditionalInitFns = {
    [types_1.Emulators.APPHOSTING]: async (config) => {
        var _a;
        const cwd = process.cwd();
        const additionalConfigs = new Map();
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.APPHOSTING);
        logger.logLabeled("INFO", "Initializing Emulator");
        const backendRelativeDir = await (0, prompt_1.input)({
            message: "Specify your app's root directory relative to your repository",
            default: "./",
        });
        additionalConfigs.set("rootDirectory", backendRelativeDir);
        const backendRoot = (0, path_1.join)(cwd, backendRelativeDir);
        try {
            const startCommand = await (0, developmentServer_1.detectStartCommand)(backendRoot);
            additionalConfigs.set("startCommand", startCommand);
        }
        catch (e) {
            logger.log("WARN", "Failed to auto-detect your project's start command. Consider manually setting the start command by setting `firebase.json#emulators.apphosting.startCommand`");
        }
        const projectId = (0, projectUtils_1.getProjectId)(config.options);
        let env = [];
        try {
            env = await (0, config_1.maybeGenerateEmulatorYaml)(projectId, backendRoot);
        }
        catch (e) {
            logger.log("WARN", "failed to export app hosting configs");
        }
        const secretIds = (_a = env === null || env === void 0 ? void 0 : env.filter((e) => "secret" in e)) === null || _a === void 0 ? void 0 : _a.map((e) => e.secret);
        if (secretIds === null || secretIds === void 0 ? void 0 : secretIds.length) {
            if (!projectId) {
                logger.log("WARN", "Cannot grant developers access to secrets for local development without knowing what project the secret is in. " +
                    `Run ${clc.bold(`firebase apphosting:secrets:grantaccess ${secretIds.join(",")} --project [project] --emails [email list]`)}`);
            }
            else {
                const users = await (0, prompt_1.input)("Your config has secret values. Please provide a comma-separated list of users or groups who should have access to secrets for local development: ");
                if (users.length) {
                    await (0, secrets_1.grantEmailsSecretAccess)(projectId, secretIds, users.split(",").map((u) => u.trim()));
                }
                else {
                    logger.log("INFO", "Skipping granting developers access to secrets for local development. To grant access in the future, run " +
                        `Run ${clc.bold(`firebase apphosting:secrets:grantaccess ${secretIds.join(",")} --emails [email list]`)}`);
                }
            }
        }
        return mapToObject(additionalConfigs);
    },
    [types_1.Emulators.DATACONNECT]: async (config) => {
        const additionalConfig = {};
        const defaultDataConnectDir = config.get("dataconnect.source", "dataconnect");
        const defaultDataDir = config.get("emulators.dataconnect.dataDir", `${defaultDataConnectDir}/.dataconnect/pgliteData`);
        if (await (0, prompt_1.confirm)("Do you want to persist Postgres data from the Data Connect emulator between runs? " +
            `Data will be saved to ${defaultDataDir}. ` +
            `You can change this directory by editing 'firebase.json#emulators.dataconnect.dataDir'.`)) {
            additionalConfig["dataDir"] = defaultDataDir;
        }
        return additionalConfig;
    },
};
function mapToObject(map) {
    const newObject = {};
    for (const [key, value] of map) {
        newObject[key] = value;
    }
    return newObject;
}
