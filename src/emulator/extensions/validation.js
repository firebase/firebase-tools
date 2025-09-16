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
exports.checkForUnemulatedTriggerTypes = exports.getUnemulatedAPIs = void 0;
const planner = __importStar(require("../../deploy/extensions/planner"));
const controller_1 = require("../controller");
const constants_1 = require("../constants");
const ensureApiEnabled_1 = require("../../ensureApiEnabled");
const functionsEmulatorShared_1 = require("../functionsEmulatorShared");
const types_1 = require("../types");
const EMULATED_APIS = [
    "storage-component.googleapis.com",
    "firestore.googleapis.com",
    "pubsub.googleapis.com",
    "identitytoolkit.googleapis.com",
    // TODO: Is there a RTDB API we need to add here? I couldn't find one.
];
/**
 * getUnemulatedAPIs checks a list of InstanceSpecs for APIs that are not emulated.
 * It returns a map of API name to list of instanceIds that use that API.
 */
async function getUnemulatedAPIs(projectId, instances) {
    const unemulatedAPIs = {};
    for (const i of instances) {
        const extensionSpec = await planner.getExtensionSpec(i);
        for (const api of extensionSpec.apis ?? []) {
            if (!EMULATED_APIS.includes(api.apiName)) {
                if (unemulatedAPIs[api.apiName]) {
                    unemulatedAPIs[api.apiName].instanceIds.push(i.instanceId);
                }
                else {
                    const enabled = !constants_1.Constants.isDemoProject(projectId) &&
                        (await (0, ensureApiEnabled_1.check)(projectId, api.apiName, "extensions", true));
                    unemulatedAPIs[api.apiName] = {
                        apiName: api.apiName,
                        instanceIds: [i.instanceId],
                        enabled,
                    };
                }
            }
        }
    }
    return Object.values(unemulatedAPIs);
}
exports.getUnemulatedAPIs = getUnemulatedAPIs;
/**
 * Checks a EmulatableBackend for any functions that trigger off of emulators that are not running or not implemented.
 * @param backend
 */
function checkForUnemulatedTriggerTypes(backend, options) {
    const triggers = backend.predefinedTriggers ?? [];
    const unemulatedTriggers = triggers
        .filter((definition) => {
        if (definition.httpsTrigger) {
            // HTTPS triggers can always be emulated.
            return false;
        }
        if (definition.eventTrigger) {
            const service = (0, functionsEmulatorShared_1.getFunctionService)(definition);
            switch (service) {
                case constants_1.Constants.SERVICE_FIRESTORE:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.FIRESTORE);
                case constants_1.Constants.SERVICE_REALTIME_DATABASE:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.DATABASE);
                case constants_1.Constants.SERVICE_PUBSUB:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.PUBSUB);
                case constants_1.Constants.SERVICE_AUTH:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.AUTH);
                case constants_1.Constants.SERVICE_STORAGE:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.STORAGE);
                case constants_1.Constants.SERVICE_EVENTARC:
                    return !(0, controller_1.shouldStart)(options, types_1.Emulators.EVENTARC);
                default:
                    return true;
            }
        }
    })
        .map((definition) => constants_1.Constants.getServiceName((0, functionsEmulatorShared_1.getFunctionService)(definition)));
    // Remove duplicates
    return [...new Set(unemulatedTriggers)];
}
exports.checkForUnemulatedTriggerTypes = checkForUnemulatedTriggerTypes;
//# sourceMappingURL=validation.js.map