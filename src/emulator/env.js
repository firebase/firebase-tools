"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeUsePortForwarding = exports.getCredentialsEnvironment = exports.setEnvVarsForEmulators = void 0;
const constants_1 = require("./constants");
const types_1 = require("./types");
const functionsEmulatorShared_1 = require("./functionsEmulatorShared");
const defaultCredentials_1 = require("../defaultCredentials");
/**
 * Adds or replaces emulator-related env vars (for Admin SDKs, etc.).
 * @param env a `process.env`-like object or Record to be modified
 * @param emulators the emulator info to use
 */
function setEnvVarsForEmulators(env, emulators) {
    for (const emu of emulators) {
        const host = (0, functionsEmulatorShared_1.formatHost)(emu);
        switch (emu.name) {
            case types_1.Emulators.FIRESTORE:
                env[constants_1.Constants.FIRESTORE_EMULATOR_HOST] = host;
                env[constants_1.Constants.FIRESTORE_EMULATOR_ENV_ALT] = host;
                break;
            case types_1.Emulators.DATABASE:
                env[constants_1.Constants.FIREBASE_DATABASE_EMULATOR_HOST] = host;
                break;
            case types_1.Emulators.STORAGE:
                env[constants_1.Constants.FIREBASE_STORAGE_EMULATOR_HOST] = host;
                // The protocol is required for the Google Cloud Storage Node.js Client SDK.
                env[constants_1.Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${host}`;
                break;
            case types_1.Emulators.AUTH:
                env[constants_1.Constants.FIREBASE_AUTH_EMULATOR_HOST] = host;
                break;
            case types_1.Emulators.HUB:
                env[constants_1.Constants.FIREBASE_EMULATOR_HUB] = host;
                break;
            case types_1.Emulators.PUBSUB:
                env[constants_1.Constants.PUBSUB_EMULATOR_HOST] = host;
                break;
            case types_1.Emulators.EVENTARC:
                env[constants_1.Constants.CLOUD_EVENTARC_EMULATOR_HOST] = `http://${host}`;
                break;
            case types_1.Emulators.TASKS:
                env[constants_1.Constants.CLOUD_TASKS_EMULATOR_HOST] = host;
                break;
            case types_1.Emulators.DATACONNECT:
                // Right now, the JS SDK requires a protocol within the env var.
                // https://github.com/firebase/firebase-js-sdk/blob/88a8055808bdbd1c75011a94d11062460027d931/packages/data-connect/src/api/DataConnect.ts#L74
                env[constants_1.Constants.FIREBASE_DATACONNECT_EMULATOR_HOST] = `http://${host}`;
                // The alternative env var, right now only read by the Node.js Admin SDK, does not work if a protocol is appended.
                // https://github.com/firebase/firebase-admin-node/blob/a46086b61f58f07426a6ca103e00385ae216691d/src/data-connect/data-connect-api-client-internal.ts#L220
                env[constants_1.Constants.FIREBASE_DATACONNECT_ENV_ALT] = host;
                // A previous CLI release set the following env var as well but it is missing an underscore between `DATA` and `CONNECT`.
                // We'll keep setting this for customers who depends on this misspelled name. Its value is also kept protocol-less.
                env["FIREBASE_DATACONNECT_EMULATOR_HOST"] = host;
        }
    }
}
exports.setEnvVarsForEmulators = setEnvVarsForEmulators;
/**
 * getCredentialsEnvironment returns any extra env vars beyond process.env that should be provided to emulators to ensure they have credentials.
 */
async function getCredentialsEnvironment(account, logger, logLabel, silent = false) {
    // Provide default application credentials when appropriate
    const credentialEnv = {};
    if (await (0, defaultCredentials_1.hasDefaultCredentials)()) {
        !silent &&
            logger.logLabeled("WARN", logLabel, `Application Default Credentials detected. Non-emulated services will access production using these credentials. Be careful!`);
    }
    else if (account) {
        const defaultCredPath = await (0, defaultCredentials_1.getCredentialPathAsync)(account);
        if (defaultCredPath) {
            logger.log("DEBUG", `Setting GAC to ${defaultCredPath}`);
            credentialEnv.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
        }
    }
    return credentialEnv;
}
exports.getCredentialsEnvironment = getCredentialsEnvironment;
function maybeUsePortForwarding(i) {
    const portForwardingHost = process.env.WEB_HOST;
    if (portForwardingHost) {
        const info = { ...i };
        if (info.host.includes(portForwardingHost)) {
            // Never double apply this. Added as a safety check against sloppy usage.
            return info;
        }
        const url = `${info.port}-${portForwardingHost}`;
        info.host = url;
        info.listen = info.listen?.map((listen) => {
            const l = { ...listen };
            l.address = url;
            l.port = 443;
            return l;
        });
        info.port = 443;
        const fsInfo = info;
        if (fsInfo.webSocketPort) {
            fsInfo.webSocketHost = `${fsInfo.webSocketPort}-${portForwardingHost}`;
            fsInfo.webSocketPort = 443;
        }
        return info;
    }
    return i;
}
exports.maybeUsePortForwarding = maybeUsePortForwarding;
//# sourceMappingURL=env.js.map