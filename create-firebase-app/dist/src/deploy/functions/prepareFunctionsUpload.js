"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToSortedKeyValueArray = exports.prepareFunctionsUpload = exports.getFunctionsConfig = void 0;
const archiver = require("archiver");
const clc = require("colorette");
const filesize = require("filesize");
const fs = require("fs");
const path = require("path");
const tmp = require("tmp");
const error_1 = require("../../error");
const logger_1 = require("../../logger");
const hash_1 = require("./cache/hash");
const functionsConfig = require("../../functionsConfig");
const utils = require("../../utils");
const fsAsync = require("../../fsAsync");
const deprecationWarnings_1 = require("../../functions/deprecationWarnings");
const CONFIG_DEST_FILE = ".runtimeconfig.json";
// TODO(inlined): move to a file that's not about uploading source code
async function getFunctionsConfig(projectId) {
    var _a, _b;
    try {
        return await functionsConfig.materializeAll(projectId);
    }
    catch (err) {
        logger_1.logger.debug(err);
        let errorCode = (_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode;
        if (!errorCode) {
            logger_1.logger.debug("Got unexpected error from Runtime Config; it has no status code:", err);
            errorCode = 500;
        }
        if (errorCode === 500 || errorCode === 503) {
            throw new error_1.FirebaseError("Cloud Runtime Config is currently experiencing issues, " +
                "which is preventing your functions from being deployed. " +
                "Please wait a few minutes and then try to deploy your functions again." +
                "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project.");
        }
    }
    return {};
}
exports.getFunctionsConfig = getFunctionsConfig;
async function pipeAsync(from, to) {
    from.pipe(to);
    await from.finalize();
    return new Promise((resolve, reject) => {
        to.on("finish", resolve);
        to.on("error", reject);
    });
}
async function packageSource(sourceDir, config, runtimeConfig) {
    const tmpFile = tmp.fileSync({ prefix: "firebase-functions-", postfix: ".zip" }).name;
    const fileStream = fs.createWriteStream(tmpFile, {
        flags: "w",
        encoding: "binary",
    });
    const archive = archiver("zip");
    const hashes = [];
    // We must ignore firebase-debug.log or weird things happen if
    // you're in the public dir when you deploy.
    // We ignore any CONFIG_DEST_FILE that already exists, and write another one
    // with current config values into the archive in the "end" handler for reader
    const ignore = config.ignore || ["node_modules", ".git"];
    ignore.push("firebase-debug.log", "firebase-debug.*.log", CONFIG_DEST_FILE /* .runtimeconfig.json */);
    try {
        const files = await fsAsync.readdirRecursive({ path: sourceDir, ignore: ignore });
        for (const file of files) {
            const name = path.relative(sourceDir, file.name);
            const fileHash = await (0, hash_1.getSourceHash)(file.name);
            hashes.push(fileHash);
            archive.file(file.name, {
                name,
                mode: file.mode,
            });
        }
        if (typeof runtimeConfig !== "undefined") {
            // In order for hash to be consistent, configuration object tree must be sorted by key, only possible with arrays.
            const runtimeConfigHashString = JSON.stringify(convertToSortedKeyValueArray(runtimeConfig));
            hashes.push(runtimeConfigHashString);
            const runtimeConfigString = JSON.stringify(runtimeConfig, null, 2);
            archive.append(runtimeConfigString, {
                name: CONFIG_DEST_FILE,
                mode: 420 /* 0o644 */,
            });
            // Only warn about deprecated runtime config if there are user-defined values
            // (i.e., keys other than the default 'firebase' key)
            if (Object.keys(runtimeConfig).some((k) => k !== "firebase")) {
                (0, deprecationWarnings_1.logFunctionsConfigDeprecationWarning)();
            }
        }
        await pipeAsync(archive, fileStream);
    }
    catch (err) {
        throw new error_1.FirebaseError("Could not read source directory. Remove links and shortcuts and try again.", {
            original: err,
            exit: 1,
        });
    }
    utils.logBullet(clc.cyan(clc.bold("functions:")) +
        " packaged " +
        clc.bold(sourceDir) +
        " (" +
        filesize(archive.pointer()) +
        ") for uploading");
    const hash = hashes.join(".");
    return { pathToSource: tmpFile, hash };
}
async function prepareFunctionsUpload(sourceDir, config, runtimeConfig) {
    return packageSource(sourceDir, config, runtimeConfig);
}
exports.prepareFunctionsUpload = prepareFunctionsUpload;
function convertToSortedKeyValueArray(config) {
    if (typeof config !== "object" || config === null)
        return config;
    return Object.keys(config)
        .sort()
        .map((key) => {
        return { key, value: convertToSortedKeyValueArray(config[key]) };
    });
}
exports.convertToSortedKeyValueArray = convertToSortedKeyValueArray;
