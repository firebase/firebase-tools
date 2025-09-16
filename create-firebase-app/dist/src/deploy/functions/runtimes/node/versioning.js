"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFunctionsSDKVersion = exports.getLatestSDKVersion = exports.getFunctionsSDKVersion = exports.findModuleVersion = exports.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING = void 0;
const fs = require("fs");
const path = require("path");
const clc = require("colorette");
const spawn = require("cross-spawn");
const semver = require("semver");
const logger_1 = require("../../../../logger");
const utils = require("../../../../utils");
const MIN_SDK_VERSION = "2.0.0";
const NPM_COMMAND_TIMEOUT_MILLIES = 10000;
exports.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING = clc.bold(clc.yellow("functions: ")) +
    "You must have a " +
    clc.bold("firebase-functions") +
    " version that is at least 2.0.0. Please run " +
    clc.bold("npm i --save firebase-functions@latest") +
    " in the functions folder.";
/**
 * Exported for testing purposes only.
 *
 * @internal
 */
function findModuleVersion(name, resolvedPath) {
    let searchPath = path.dirname(resolvedPath);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (searchPath === "/" || path.basename(searchPath) === "node_modules") {
            logger_1.logger.debug(`Failed to find version of module ${name}: reached end of search path ${searchPath}`);
            return;
        }
        const maybePackageJson = path.join(searchPath, "package.json");
        if (fs.existsSync(maybePackageJson)) {
            const pkg = require(maybePackageJson);
            if (pkg.name === name) {
                return pkg.version;
            }
            logger_1.logger.debug(`Failed to find version of module ${name}: instead found ${pkg.name} at ${searchPath}`);
            return;
        }
        searchPath = path.dirname(searchPath);
    }
}
exports.findModuleVersion = findModuleVersion;
/**
 * Returns the version of firebase-functions SDK specified by package.json and package-lock.json.
 * @param sourceDir Source directory of functions code
 * @return version string (e.g. "3.1.2"), or void if firebase-functions is not in package.json
 * or if we had trouble getting the version.
 */
function getFunctionsSDKVersion(sourceDir) {
    try {
        return findModuleVersion("firebase-functions", 
        // Find the entry point of the firebase-function module. require.resolve works for project directories using
        //   npm, yarn (1), or yarn (1) workspaces. Does not support yarn (2) since GCF doesn't support it anyway:
        //   https://issuetracker.google.com/issues/213632942.
        require.resolve("firebase-functions", { paths: [sourceDir] }));
    }
    catch (e) {
        if (e.code === "MODULE_NOT_FOUND") {
            utils.logLabeledWarning("functions", "Couldn't find firebase-functions package in your source code. Have you run 'npm install'?");
        }
        logger_1.logger.debug("getFunctionsSDKVersion encountered error:", e);
        return;
    }
}
exports.getFunctionsSDKVersion = getFunctionsSDKVersion;
/**
 * Get latest version of the Firebase Functions SDK.
 */
function getLatestSDKVersion() {
    var _a;
    const child = spawn.sync("npm", ["show", "firebase-functions", "--json=true"], {
        encoding: "utf8",
        timeout: NPM_COMMAND_TIMEOUT_MILLIES,
    });
    if (child.error) {
        logger_1.logger.debug("checkFunctionsSDKVersion was unable to fetch information from NPM", child.error.stack);
        return;
    }
    const output = JSON.parse(child.stdout);
    if (Object.keys(output).length === 0) {
        return;
    }
    return (_a = output["dist-tags"]) === null || _a === void 0 ? void 0 : _a["latest"];
}
exports.getLatestSDKVersion = getLatestSDKVersion;
/**
 * Checks if firebase-functions SDK is not the latest version in NPM, and prints update notice if it is outdated.
 * If it is unable to do the check, it does nothing.
 * @param sourceDir the location of the customer's source code.
 */
function checkFunctionsSDKVersion(currentVersion) {
    try {
        if (semver.lt(currentVersion, MIN_SDK_VERSION)) {
            utils.logWarning(exports.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
        }
        // N.B. We must use exports.getLatestSDKVersion so that the method dynamic and we can stub in tests.
        const latest = exports.getLatestSDKVersion();
        if (!latest) {
            return;
        }
        if (semver.eq(currentVersion, latest)) {
            return;
        }
        utils.logWarning(clc.bold(clc.yellow("functions: ")) +
            "package.json indicates an outdated version of firebase-functions. Please upgrade using " +
            clc.bold("npm install --save firebase-functions@latest") +
            " in your functions directory.");
        if (semver.major(currentVersion) < semver.major(latest)) {
            utils.logWarning(clc.bold(clc.yellow("functions: ")) +
                "Please note that there will be breaking changes when you upgrade.");
        }
    }
    catch (e) {
        logger_1.logger.debug("checkFunctionsSDKVersion encountered error:", e);
        return;
    }
}
exports.checkFunctionsSDKVersion = checkFunctionsSDKVersion;
