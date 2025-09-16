"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalExtension = exports.readFile = exports.findExtensionYaml = exports.getLocalExtensionSpec = exports.EXTENSIONS_SPEC_FILE = void 0;
const fs = require("fs-extra");
const path = require("path");
const yaml = require("yaml");
const fsutils_1 = require("../fsutils");
const error_1 = require("../error");
const types_1 = require("./types");
const logger_1 = require("../logger");
const extensionsHelper_1 = require("./extensionsHelper");
exports.EXTENSIONS_SPEC_FILE = "extension.yaml";
const EXTENSIONS_PREINSTALL_FILE = "PREINSTALL.md";
/**
 * Retrieves and parses an ExtensionSpec from a local directory
 * @param directory the directory to look for extension.yaml and PRESINSTALL.md in
 */
async function getLocalExtensionSpec(directory) {
    const spec = await parseYAML(readFile(path.resolve(directory, exports.EXTENSIONS_SPEC_FILE)));
    // lifecycleEvents are formatted differently once they have been uploaded
    if (spec.lifecycleEvents) {
        spec.lifecycleEvents = fixLifecycleEvents(spec.lifecycleEvents);
    }
    if (!(0, types_1.isExtensionSpec)(spec)) {
        (0, extensionsHelper_1.validateSpec)(spec); // Maybe throw with more details
        throw new error_1.FirebaseError("Error: extension.yaml does not contain a valid extension specification.");
    }
    try {
        const preinstall = readFile(path.resolve(directory, EXTENSIONS_PREINSTALL_FILE));
        spec.preinstallContent = preinstall;
    }
    catch (err) {
        logger_1.logger.debug(`No PREINSTALL.md found in directory ${directory}.`);
    }
    return spec;
}
exports.getLocalExtensionSpec = getLocalExtensionSpec;
function fixLifecycleEvents(lifecycleEvents) {
    const stages = {
        onInstall: "ON_INSTALL",
        onUpdate: "ON_UPDATE",
        onConfigure: "ON_CONFIGURE",
        stageUnspecified: "STAGE_UNSPECIFIED",
    };
    const arrayLifecycle = [];
    if ((0, error_1.isObject)(lifecycleEvents)) {
        for (const [key, val] of Object.entries(lifecycleEvents)) {
            if ((0, error_1.isObject)(val) &&
                typeof val.function === "string" &&
                typeof val.processingMessage === "string") {
                arrayLifecycle.push({
                    stage: stages[key] || stages["stageUnspecified"],
                    taskQueueTriggerFunction: val.function,
                });
            }
        }
    }
    return arrayLifecycle;
}
/**
 * Climbs directories loking for an extension.yaml file, and return the first
 * directory that contains one. Throws an error if none is found.
 * @param directory the directory to start from searching from.
 */
function findExtensionYaml(directory) {
    while (!(0, fsutils_1.fileExistsSync)(path.resolve(directory, exports.EXTENSIONS_SPEC_FILE))) {
        const parentDir = path.dirname(directory);
        if (parentDir === directory) {
            throw new error_1.FirebaseError("Couldn't find an extension.yaml file. Check that you are in the root directory of your extension.");
        }
        directory = parentDir;
    }
    return directory;
}
exports.findExtensionYaml = findExtensionYaml;
/**
 * Retrieves a file from the directory.
 * @param pathToFile the path to the file to read
 */
function readFile(pathToFile) {
    try {
        return fs.readFileSync(pathToFile, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new error_1.FirebaseError(`Could not find "${pathToFile}"`, { original: err });
        }
        throw new error_1.FirebaseError(`Failed to read file at "${pathToFile}"`, { original: err });
    }
}
exports.readFile = readFile;
/**
 * Checks if an extension name is a local extension by checking if a directory exists at that location
 * @param extensionName an extension name to check
 */
function isLocalExtension(extensionName) {
    try {
        fs.readdirSync(extensionName);
    }
    catch (err) {
        return false;
    }
    return true;
}
exports.isLocalExtension = isLocalExtension;
/**
 * Wraps `yaml.parse` with an error handler to present better YAML parsing
 * errors.
 * @param source an unparsed YAML string
 */
function parseYAML(source) {
    try {
        return yaml.parse(source);
    }
    catch (err) {
        if (err instanceof yaml.YAMLParseError) {
            throw new error_1.FirebaseError(`YAML Error: ${err.message}`, { original: err });
        }
        throw new error_1.FirebaseError(err.message);
    }
}
