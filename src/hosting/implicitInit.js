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
exports.implicitInit = void 0;
const _ = __importStar(require("lodash"));
const clc = __importStar(require("colorette"));
const fetchWebSetup_1 = require("../fetchWebSetup");
const utils = __importStar(require("../utils"));
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
//# sourceMappingURL=implicitInit.js.map