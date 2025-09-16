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
exports.getPubSpec = exports.getAdditionalBuildArgs = exports.assertFlutterCliExists = void 0;
const cross_spawn_1 = require("cross-spawn");
const error_1 = require("../../error");
const promises_1 = require("fs/promises");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const yaml = __importStar(require("yaml"));
function assertFlutterCliExists() {
    const process = (0, cross_spawn_1.sync)("flutter", ["--version"], { stdio: "ignore" });
    if (process.status !== 0)
        throw new error_1.FirebaseError("Flutter CLI not found, follow the instructions here https://docs.flutter.dev/get-started/install before trying again.");
}
exports.assertFlutterCliExists = assertFlutterCliExists;
/**
 * Determines additional build arguments for Flutter based on the project's dependencies.
 * @param {Record<string, any>} pubSpec - The parsed pubspec.yaml file contents.
 * @return {string[]} An array of additional build arguments.
 * @description
 * This function checks if the project uses certain packages that might require additional
 * flags to be added to the build step. If any of these packages are present in the
 * project's dependencies, the function returns an array with these flags.
 * Otherwise, it returns an empty array.
 * This change is inspired from the following issue:
 * https://github.com/firebase/firebase-tools/issues/6197
 */
function getAdditionalBuildArgs(pubSpec) {
    /*
    These packages are known to require the --no-tree-shake-icons flag
    when building for web.
    More dependencies might need to add here in the future.
    Related issue: https://github.com/firebase/firebase-tools/issues/6197
    */
    const treeShakePackages = [
        "material_icons_named",
        "material_symbols_icons",
        "material_design_icons_flutter",
        "flutter_iconpicker",
        "font_awesome_flutter",
        "ionicons_named",
    ];
    const hasTreeShakePackage = treeShakePackages.some((pkg) => pubSpec.dependencies?.[pkg]);
    const treeShakeFlags = hasTreeShakePackage ? ["--no-tree-shake-icons"] : [];
    return [...treeShakeFlags];
}
exports.getAdditionalBuildArgs = getAdditionalBuildArgs;
/**
 * Reads and parses the pubspec.yaml file from a given directory.
 * @param {string} dir - The directory path where pubspec.yaml is located.
 * @return {Promise<Record<string, any>>} A promise that resolves to the parsed contents of pubspec.yaml.
 * @description
 * This function checks for the existence of both pubspec.yaml and the 'web' directory
 * in the given path. If either is missing, it returns an empty object.
 * If both exist, it reads the pubspec.yaml file, parses its contents, and returns
 * the parsed object. In case of any errors during this process, it logs a message
 * and returns an empty object.
 */
async function getPubSpec(dir) {
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "pubspec.yaml"))))
        return {};
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "web"))))
        return {};
    try {
        const pubSpecBuffer = await (0, promises_1.readFile)((0, path_1.join)(dir, "pubspec.yaml"));
        return yaml.parse(pubSpecBuffer.toString());
    }
    catch (error) {
        console.info("Failed to read pubspec.yaml");
        return {};
    }
}
exports.getPubSpec = getPubSpec;
//# sourceMappingURL=utils.js.map