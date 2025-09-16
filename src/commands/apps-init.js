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
exports.command = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const command_1 = require("../command");
const apps_1 = require("../management/apps");
const requireAuth_1 = require("../requireAuth");
const logger_1 = require("../logger");
const projectUtils_1 = require("../projectUtils");
const types_1 = require("../dataconnect/types");
const experiments_1 = require("../experiments");
function logUse(platform, filePath) {
    switch (platform) {
        case apps_1.AppPlatform.WEB:
            logger_1.logger.info(`
How to use your JS SDK Config:
ES Module:
import { initializeApp } from 'firebase/app';
import json from './${filePath || "firebase-sdk-config.json"}';
initializeApp(json); // or copy and paste the config directly from the json file here
// CommonJS Module:
const { initializeApp } = require('firebase/app');
const json = require('./firebase-js-config.json');
initializeApp(json); // or copy and paste the config directly from the json file here`);
            break;
        case apps_1.AppPlatform.ANDROID:
            logger_1.logger.info(`Visit https://firebase.google.com/docs/android/setup#add-config-file
for information on editing your gradle file and adding Firebase SDKs to your app.

If you're using Unity or C++, visit https://firebase.google.com/docs/cpp/setup?platform=android#add-config-file
for information about adding your config file to your project.`);
            break;
        case apps_1.AppPlatform.IOS:
            logger_1.logger.info(`Visit https://firebase.google.com/docs/ios/setup#add-config-file
for information on adding the config file to your targets and adding Firebase SDKs to your app.

If you're using Unity or C++, visit https://firebase.google.com/docs/cpp/setup?platform=ios#add-config-file
for information about adding your config file to your project.`);
            break;
    }
}
function toAppPlatform(str) {
    switch (str.toUpperCase()) {
        case types_1.Platform.ANDROID:
            return types_1.Platform.ANDROID;
        case types_1.Platform.IOS:
            return types_1.Platform.IOS;
        case types_1.Platform.WEB:
            return types_1.Platform.WEB;
    }
    throw new Error(`Platform ${str} is not compatible with apps:configure`);
}
exports.command = new command_1.Command("apps:init [platform] [appId]")
    .description("automatically download and create config of a Firebase app")
    .before(requireAuth_1.requireAuth)
    .option("-o, --out [file]", "(optional) write config output to a file")
    .action(async (platform = "", appId = "", options) => {
    (0, experiments_1.assertEnabled)("appsinit", "autoconfigure an app");
    if (typeof options.out === "boolean") {
        throw new Error("Please specify a file path to output to.");
    }
    const config = options.config;
    const appDir = process.cwd();
    // auto-detect the platform
    const detectedPlatform = platform ? toAppPlatform(platform) : await (0, apps_1.getPlatform)(appDir, config);
    let sdkConfig;
    while (sdkConfig === undefined) {
        try {
            sdkConfig = await (0, apps_1.getSdkConfig)(options, (0, apps_1.getAppPlatform)(detectedPlatform), appId);
        }
        catch (e) {
            if (e.message.includes("associated with this Firebase project")) {
                const projectId = (0, projectUtils_1.needProjectId)(options);
                await (0, apps_1.sdkInit)(detectedPlatform, { ...options, project: projectId });
            }
            else {
                throw e;
            }
        }
    }
    let outputPath = options.out;
    const fileInfo = (0, apps_1.getAppConfigFile)(sdkConfig, detectedPlatform);
    let relativePath = "";
    outputPath = outputPath || (await (0, apps_1.getSdkOutputPath)(appDir, detectedPlatform, options));
    const outputDir = path.dirname(outputPath);
    fs.mkdirpSync(outputDir);
    relativePath = path.relative(appDir, outputPath);
    const written = await (0, apps_1.writeConfigToFile)(outputPath, options.nonInteractive, fileInfo.fileContents);
    if (written) {
        logger_1.logger.info(`App configuration is written in ${relativePath}`);
    }
    logUse(detectedPlatform, relativePath);
    return sdkConfig;
});
//# sourceMappingURL=apps-init.js.map