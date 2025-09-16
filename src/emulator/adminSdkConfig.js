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
exports.getProjectAdminSdkConfigOrCached = exports.constructDefaultAdminSdkConfig = void 0;
const api_1 = require("../api");
const apiv2 = __importStar(require("../apiv2"));
const configstore_1 = require("../configstore");
const error_1 = require("../error");
const logger_1 = require("../logger");
const constants_1 = require("./constants");
const _CONFIGSTORE_KEY = "adminsdkconfig";
/**
 * When all else fails we can "guess" the AdminSdkConfig, although this is likely to
 * be incorrect.
 */
function constructDefaultAdminSdkConfig(projectId) {
    // Do our best to provide reasonable FIREBASE_CONFIG, based on firebase-functions implementation
    // https://github.com/firebase/firebase-functions/blob/59d6a7e056a7244e700dc7b6a180e25b38b647fd/src/setup.ts#L45
    return {
        projectId: projectId,
        databaseURL: process.env.DATABASE_URL || `https://${projectId}.firebaseio.com`,
        storageBucket: process.env.STORAGE_BUCKET_URL || `${projectId}.appspot.com`,
    };
}
exports.constructDefaultAdminSdkConfig = constructDefaultAdminSdkConfig;
/**
 * Get the Admin SDK configuration associated with a project, falling back to a cache when offline.
 */
async function getProjectAdminSdkConfigOrCached(projectId) {
    // When using the emulators with a fake project Id, use a fake project config.
    if (constants_1.Constants.isDemoProject(projectId)) {
        return constructDefaultAdminSdkConfig(projectId);
    }
    try {
        const config = await getProjectAdminSdkConfig(projectId);
        setCacheAdminSdkConfig(projectId, config);
        return config;
    }
    catch (e) {
        logger_1.logger.debug(`Failed to get Admin SDK config for ${projectId}, falling back to cache`, e);
        return getCachedAdminSdkConfig(projectId);
    }
}
exports.getProjectAdminSdkConfigOrCached = getProjectAdminSdkConfigOrCached;
/**
 * Gets the Admin SDK configuration associated with a project.
 */
async function getProjectAdminSdkConfig(projectId) {
    const apiClient = new apiv2.Client({
        auth: true,
        apiVersion: "v1beta1",
        urlPrefix: (0, api_1.firebaseApiOrigin)(),
    });
    if (projectId.startsWith("demo-")) {
        logger_1.logger.debug(`Detected demo- project: ${projectId}. Using default adminSdkConfig instead of calling firebase API.`);
        return {
            projectId,
            databaseURL: `${projectId}-default-rtdb.firebaseio.com`,
            storageBucket: `${projectId}.appspot.com`,
        };
    }
    try {
        const res = await apiClient.get(`projects/${projectId}/adminSdkConfig`);
        return res.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get Admin SDK for Firebase project ${projectId}. ` +
            "Please make sure the project exists and your account has permission to access it.", { exit: 2, original: err });
    }
}
function setCacheAdminSdkConfig(projectId, config) {
    const allConfigs = configstore_1.configstore.get(_CONFIGSTORE_KEY) || {};
    allConfigs[projectId] = config;
    configstore_1.configstore.set(_CONFIGSTORE_KEY, allConfigs);
}
function getCachedAdminSdkConfig(projectId) {
    const allConfigs = configstore_1.configstore.get(_CONFIGSTORE_KEY) || {};
    return allConfigs[projectId];
}
//# sourceMappingURL=adminSdkConfig.js.map