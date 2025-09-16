"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.implicitInit = void 0;
const _ = require("lodash");
const clc = require("colorette");
const fetchWebSetup_1 = require("../fetchWebSetup");
const utils = require("../utils");
const logger_1 = require("../logger");
const registry_1 = require("../emulator/registry");
const types_1 = require("../emulator/types");
const templates_1 = require("../templates");
/**
 * Generate template server response.
 * @param options the Firebase CLI options object.
 * @return Initialized server response by template.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function implicitInit(options) {
    let config;
    try {
        config = await (0, fetchWebSetup_1.fetchWebSetup)(options);
    }
    catch (e) {
        logger_1.logger.debug("fetchWebSetup error: " + e);
        const statusCode = _.get(e, "context.response.statusCode");
        if (statusCode === 403) {
            utils.logLabeledWarning("hosting", `Authentication error when trying to fetch your current web app configuration, have you run ${clc.bold("firebase login")}?`);
        }
    }
    if (!config) {
        config = (0, fetchWebSetup_1.getCachedWebSetup)(options);
        if (config) {
            utils.logLabeledWarning("hosting", "Using web app configuration from cache.");
        }
    }
    if (!config) {
        config = undefined;
        utils.logLabeledWarning("hosting", "Could not fetch web app configuration and there is no cached configuration on this machine. " +
            "Check your internet connection and make sure you are authenticated. " +
            "To continue, you must call firebase.initializeApp({...}) in your code before using Firebase.");
    }
    const configJson = JSON.stringify(config, null, 2);
    const emulators = {};
    for (const e of types_1.EMULATORS_SUPPORTED_BY_USE_EMULATOR) {
        const info = registry_1.EmulatorRegistry.getInfo(e);
        if (info) {
            emulators[e] = {
                host: info.host,
                port: info.port,
                hostAndPort: registry_1.EmulatorRegistry.url(e).host,
            };
        }
    }
    const emulatorsJson = JSON.stringify(emulators, null, 2);
    const initTemplate = (0, templates_1.readTemplateSync)("hosting/init.js");
    const js = initTemplate
        .replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`)
        .replace("/*--EMULATORS--*/", "var firebaseEmulators = undefined;");
    const emulatorsJs = initTemplate
        .replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`)
        .replace("/*--EMULATORS--*/", `var firebaseEmulators = ${emulatorsJson};`);
    return {
        js,
        emulatorsJs,
        json: configJson,
    };
}
exports.implicitInit = implicitInit;
