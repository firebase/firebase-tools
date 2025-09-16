"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectStartCommand = exports.detectPackageManager = exports.logger = void 0;
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const emulatorLogger_1 = require("../emulatorLogger");
const types_1 = require("../types");
const error_1 = require("../../error");
exports.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.APPHOSTING);
/**
 * Returns the package manager used by the project
 * @param rootdir project's root directory
 * @returns PackageManager
 */
async function detectPackageManager(rootdir) {
    if (await (0, fs_extra_1.pathExists)((0, path_1.join)(rootdir, "pnpm-lock.yaml"))) {
        return "pnpm";
    }
    if (await (0, fs_extra_1.pathExists)((0, path_1.join)(rootdir, "yarn.lock"))) {
        return "yarn";
    }
    if (await (0, fs_extra_1.pathExists)((0, path_1.join)(rootdir, "package-lock.json"))) {
        return "npm";
    }
    throw new error_1.FirebaseError("Unsupported package manager");
}
exports.detectPackageManager = detectPackageManager;
async function detectStartCommand(rootDir) {
    try {
        const packageManager = await detectPackageManager(rootDir);
        return `${packageManager} run dev`;
    }
    catch (e) {
        throw new error_1.FirebaseError("Failed to auto-detect your project's start command. Consider manually setting the start command by setting `firebase.json#emulators.apphosting.startCommand`");
    }
}
exports.detectStartCommand = detectStartCommand;
//# sourceMappingURL=developmentServer.js.map