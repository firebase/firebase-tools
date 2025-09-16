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
exports.updateConfig = exports.setBlockingFunctionsConfig = exports.getConfig = exports.getBlockingFunctionsConfig = void 0;
const proto = __importStar(require("./proto"));
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const API_VERSION = "v2";
const adminApiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.identityOrigin)() + "/admin",
    apiVersion: API_VERSION,
});
/**
 * Helper function to get the blocking function config from identity platform.
 * @param project GCP project ID or number
 * @returns the blocking functions config
 */
async function getBlockingFunctionsConfig(project) {
    const config = (await getConfig(project)) || {};
    if (!config.blockingFunctions) {
        config.blockingFunctions = {};
    }
    return config.blockingFunctions;
}
exports.getBlockingFunctionsConfig = getBlockingFunctionsConfig;
/**
 * Gets the identity platform configuration.
 * @param project GCP project ID or number
 * @returns the identity platform config
 */
async function getConfig(project) {
    const response = await adminApiClient.get(`projects/${project}/config`);
    return response.body;
}
exports.getConfig = getConfig;
/**
 * Helper function to set the blocking function config to identity platform.
 * @param project GCP project ID or number
 * @param blockingConfig the blocking functions configuration to update
 * @returns the blocking functions config
 */
async function setBlockingFunctionsConfig(project, blockingConfig) {
    const config = (await updateConfig(project, { blockingFunctions: blockingConfig }, "blockingFunctions")) || {};
    if (!config.blockingFunctions) {
        config.blockingFunctions = {};
    }
    return config.blockingFunctions;
}
exports.setBlockingFunctionsConfig = setBlockingFunctionsConfig;
/**
 * Sets the identity platform configuration.
 * @param project GCP project ID or number
 * @param config the configuration to update
 * @param updateMask optional update mask for the API
 * @returns the updated config
 */
async function updateConfig(project, config, updateMask) {
    if (!updateMask) {
        updateMask = proto.fieldMasks(config).join(",");
    }
    const response = await adminApiClient.patch(`projects/${project}/config`, config, {
        queryParams: {
            updateMask,
        },
    });
    return response.body;
}
exports.updateConfig = updateConfig;
//# sourceMappingURL=identityPlatform.js.map