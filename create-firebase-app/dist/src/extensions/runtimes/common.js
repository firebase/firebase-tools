"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.longestCommonPrefix = exports.snakeToCamelCase = exports.lowercaseFirstLetter = exports.capitalizeFirstLetter = exports.toTitleCase = exports.getInstallPathPrefix = exports.getCodebaseDir = exports.writeSDK = exports.getCodebaseRuntime = exports.copyDirectory = exports.writeFile = exports.isTypescriptCodebase = exports.extensionMatchesAnyFilter = exports.extractExtensionsFromBuilds = exports.fixDarkBlueText = void 0;
const fs = require("fs");
const path = require("path");
const prompt_1 = require("../../prompt");
const fsutils = require("../../fsutils");
const utils_1 = require("../../utils");
const error_1 = require("../../error");
const projectConfig_1 = require("../../functions/projectConfig");
const functionRuntimes = require("../../deploy/functions/runtimes");
const nodeRuntime = require("./node");
/**
 * Fixes unreadable dark blue on black background to be cyan
 * @param txt The formatted text containing color codes
 * @return The formatted text with blue replaced by cyan.
 */
function fixDarkBlueText(txt) {
    // default hyperlinks etc. are not readable on black.
    const DARK_BLUE = "\u001b[34m";
    const BRIGHT_CYAN = "\u001b[36;1m";
    return txt.replaceAll(DARK_BLUE, BRIGHT_CYAN);
}
exports.fixDarkBlueText = fixDarkBlueText;
/**
 * Extracts extensions from build records
 * @param builds The builds to examine
 * @param filters The filters to use
 * @return a record of extensions by extensionId
 */
function extractExtensionsFromBuilds(builds, filters) {
    const extRecords = {};
    for (const [codebase, build] of Object.entries(builds)) {
        if (build.extensions) {
            for (const [id, ext] of Object.entries(build.extensions)) {
                if (extensionMatchesAnyFilter(codebase, id, filters)) {
                    if (extRecords[id]) {
                        // Duplicate definitions of the same instance
                        throw new error_1.FirebaseError(`Duplicate extension id found: ${id}`);
                    }
                    extRecords[id] = Object.assign(Object.assign({}, ext), { labels: { createdBy: "SDK", codebase } });
                }
            }
        }
    }
    return extRecords;
}
exports.extractExtensionsFromBuilds = extractExtensionsFromBuilds;
/**
 * Checks if the extension matches any filter
 * @param codebase The codebase to check
 * @param extensionId The extension to check
 * @param filters The filters to check against
 * @return true if the extension matches any of the filters.
 */
function extensionMatchesAnyFilter(codebase, extensionId, filters) {
    if (!filters) {
        return true;
    }
    return filters.some((f) => extensionMatchesFilter(codebase, extensionId, f));
}
exports.extensionMatchesAnyFilter = extensionMatchesAnyFilter;
/**
 * Checks if the extension matches a filter
 * @param codebase The codebase to check
 * @param extensionId The extension to check
 * @param filter The fitler to check against
 * @return true if the extension matches the filter.
 */
function extensionMatchesFilter(codebase, extensionId, filter) {
    if (codebase && filter.codebase) {
        if (codebase !== filter.codebase) {
            return false;
        }
    }
    if (!filter.idChunks) {
        // If idChunks are not provided, we match all extensions.
        return true;
    }
    // Extension instance ids are not nested. They are unique to a project.
    // They are allowed to have hyphens, so in the functions filter this will be
    // interpreted as nested chunks, so we join them again to get the original id.
    const filterId = filter.idChunks.join("-");
    return extensionId === filterId;
}
/**
 * Looks for the tsconfig.json file
 * @param codebaseDir The codebase directory to check
 * @return true iff the codebase directory is typescript.
 */
function isTypescriptCodebase(codebaseDir) {
    return fsutils.fileExistsSync(path.join(codebaseDir, "tsconfig.json"));
}
exports.isTypescriptCodebase = isTypescriptCodebase;
/**
 * Writes a file containing data. Asks permission based on options
 * @param filePath Where the create a file
 * @param data What to put into the file
 * @param options options for force or nonInteractive to skip permission requests
 */
async function writeFile(filePath, data, options) {
    const shortFilePath = filePath.replace(process.cwd(), ".");
    if (fsutils.fileExistsSync(filePath)) {
        if (await (0, prompt_1.confirm)({
            message: `${shortFilePath} already exists. Overwite it?`,
            nonInteractive: options.nonInteractive,
            force: options.force,
            default: false,
        })) {
            // overwrite
            try {
                await fs.promises.writeFile(filePath, data, { flag: "w" });
                (0, utils_1.logLabeledBullet)("extensions", `successfully wrote ${shortFilePath}`);
            }
            catch (err) {
                throw new error_1.FirebaseError(`Failed to write ${shortFilePath}:\n    ${(0, error_1.getErrMsg)(err)}`);
            }
        }
        else {
            // don't overwrite
            return;
        }
    }
    else {
        // write new file
        // Make sure the directories exist
        try {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            try {
                await fs.promises.writeFile(`${filePath}`, data, { flag: "w" });
                (0, utils_1.logLabeledBullet)("extensions", `successfully created ${shortFilePath}`);
            }
            catch (err) {
                throw new error_1.FirebaseError(`Failed to create ${shortFilePath}:\n    ${(0, error_1.getErrMsg)(err)}`);
            }
        }
        catch (err) {
            throw new error_1.FirebaseError(`Error during SDK file creation:\n    ${(0, error_1.getErrMsg)(err)}`);
        }
    }
}
exports.writeFile = writeFile;
/**
 * copies one directory to another recursively creating directories as needed.
 * It will ask for permission before overwriting any existing files.
 * @param src The source path
 * @param dest The destination path
 * @param options The command options
 */
async function copyDirectory(src, dest, options) {
    const shortDestPath = dest.replace(process.cwd(), ",");
    if (fsutils.dirExistsSync(dest)) {
        if (await (0, prompt_1.confirm)({
            message: `${shortDestPath} already exists. Copy anyway?`,
            nonInteractive: options.nonInteractive,
            force: options.force,
            default: false,
        })) {
            // copy anyway
            const entries = await fs.promises.readdir(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    if (srcPath.includes("node_modules")) {
                        // skip these
                        continue;
                    }
                    // We already have permission. Don't ask again.
                    await copyDirectory(srcPath, destPath, Object.assign(Object.assign({}, options), { force: true }));
                }
                else if (entry.isFile())
                    try {
                        await fs.promises.copyFile(srcPath, destPath);
                    }
                    catch (err) {
                        throw new error_1.FirebaseError(`Failed to copy ${destPath.replace(process.cwd(), ".")}:\n    ${(0, error_1.getErrMsg)(err)}`);
                    }
            }
        }
        else {
            // Don't overwrite
            return;
        }
    }
    else {
        await fs.promises.mkdir(dest, { recursive: true });
        await copyDirectory(src, dest, Object.assign(Object.assign({}, options), { force: true }));
    }
}
exports.copyDirectory = copyDirectory;
/**
 * getCodebaseRuntime determines the runtime from the specified optoins
 * @param options The options passed to the command
 * @return as string like 'nodejs18' or 'python312' representing the runtime.
 */
async function getCodebaseRuntime(options) {
    const config = (0, projectConfig_1.normalizeAndValidate)(options.config.src.functions);
    const codebaseConfig = (0, projectConfig_1.configForCodebase)(config, options.codebase || projectConfig_1.DEFAULT_CODEBASE);
    const localCfg = (0, projectConfig_1.requireLocal)(codebaseConfig);
    const sourceDirName = localCfg.source;
    const sourceDir = options.config.path(sourceDirName);
    const delegateContext = {
        projectId: "",
        sourceDir,
        projectDir: options.config.projectDir,
        runtime: localCfg.runtime,
    };
    let delegate;
    try {
        delegate = await functionRuntimes.getRuntimeDelegate(delegateContext);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Could not detect target language for SDK at ${sourceDir}`);
    }
    return delegate.runtime;
}
exports.getCodebaseRuntime = getCodebaseRuntime;
/**
 * writeSDK figures out which runtime we are using and then calls
 * that runtime's implementation of writeSDK.
 * @param extensionRef The extension reference of a published extension
 * @param localPath The localPath of a local extension
 * @param spec The spec for the extension
 * @param options The options passed from the ext:sdk:install command
 * @return Usage instructions for the SDK.
 */
async function writeSDK(extensionRef, localPath, spec, options) {
    // Figure out which runtime we need
    const runtime = await getCodebaseRuntime(options);
    // If the delegate is NodeJS, write the SDK
    // If we have more options, it would be better to have an extensions delegate
    if (runtime.startsWith("nodejs")) {
        let sampleImport = await nodeRuntime.writeSDK(extensionRef, localPath, spec, options);
        sampleImport = fixDarkBlueText(sampleImport);
        return sampleImport;
    }
    else {
        throw new error_1.FirebaseError(`Extension SDK generation is currently only supported for NodeJs. We detected the target source to be: ${runtime}`);
    }
}
exports.writeSDK = writeSDK;
/**
 * getCodebaseDir gets the codebase directory based on the options passed
 * @param options are used to determine which codebase and the config for it
 * @return a functions codebase directory
 */
function getCodebaseDir(options) {
    if (!options.projectRoot) {
        throw new error_1.FirebaseError("Unable to determine root directory of project");
    }
    const config = (0, projectConfig_1.normalizeAndValidate)(options.config.src.functions);
    const codebaseConfig = (0, projectConfig_1.configForCodebase)(config, options.codebase || projectConfig_1.DEFAULT_CODEBASE);
    return `${options.projectRoot}/${codebaseConfig.source}/`;
}
exports.getCodebaseDir = getCodebaseDir;
/**
 * getInstallPathPrefix gets a prefix under the codebase directory
 * for where extension SDKs should be installed.
 * @param options are used to get the functions codebase directory
 * @return an SDK install path prefix
 */
function getInstallPathPrefix(options) {
    return `${getCodebaseDir(options)}generated/extensions/`;
}
exports.getInstallPathPrefix = getInstallPathPrefix;
/**
 * toTitleCase takes the input string, capitalizes the first letter, and
 * lowercases the rest of the letters aBcdEf -> Abcdef
 * @param txt The text to transform
 * @return The title cased string
 */
function toTitleCase(txt) {
    return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
}
exports.toTitleCase = toTitleCase;
/**
 * capitalizeFirstLetter capitalizes the first letter of the input string
 * @param txt the string to transform
 * @return the input string with the first letter capitalized
 */
function capitalizeFirstLetter(txt) {
    return txt.charAt(0).toUpperCase() + txt.substring(1);
}
exports.capitalizeFirstLetter = capitalizeFirstLetter;
/**
 * lowercaseFirstLetter makes the first letter of a string lowercase
 * @param txt a string to transform
 * @return the input string but with the first letter lowercase
 */
function lowercaseFirstLetter(txt) {
    return txt.charAt(0).toLowerCase() + txt.substring(1);
}
exports.lowercaseFirstLetter = lowercaseFirstLetter;
/**
 * snakeToCamelCase transforms text from snake_case to camelCase.
 * @param txt the snake_case string to transform
 * @return a camelCase string
 */
function snakeToCamelCase(txt) {
    let ret = txt.toLowerCase();
    ret = ret.replace(/_/g, " ");
    ret = ret.replace(/\w\S*/g, toTitleCase);
    ret = ret.charAt(0).toLowerCase() + ret.substring(1);
    return ret;
}
exports.snakeToCamelCase = snakeToCamelCase;
/**
 * longestCommonPrefix extracts the longest common prefix from an array of string
 * @param arr The array to find a longest common prefix in.
 * @return A string that is the longest common prefix
 */
function longestCommonPrefix(arr) {
    if (arr.length === 0) {
        return "";
    }
    let prefix = "";
    for (let pos = 0; pos < arr[0].length; pos++) {
        if (arr.every((s) => s.charAt(pos) === arr[0][pos])) {
            prefix += arr[0][pos];
        }
        else
            break;
    }
    return prefix;
}
exports.longestCommonPrefix = longestCommonPrefix;
