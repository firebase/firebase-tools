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
exports.convertToSortedKeyValueArray = exports.prepareFunctionsUpload = exports.getFunctionsConfig = void 0;
const archiver = __importStar(require("archiver"));
const clc = __importStar(require("colorette"));
const filesize = __importStar(require("filesize"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tmp = __importStar(require("tmp"));
const error_1 = require("../../error");
const logger_1 = require("../../logger");
const hash_1 = require("./cache/hash");
const functionsConfig = __importStar(require("../../functionsConfig"));
const utils = __importStar(require("../../utils"));
const fsAsync = __importStar(require("../../fsAsync"));
const deprecationWarnings_1 = require("../../functions/deprecationWarnings");
const CONFIG_DEST_FILE = ".runtimeconfig.json";
// TODO(inlined): move to a file that's not about uploading source code
async function getFunctionsConfig(projectId) {
    try {
        return await functionsConfig.materializeAll(projectId);
    }
    catch (err) {
        logger_1.logger.debug(err);
        let errorCode = err?.context?.response?.statusCode;
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
//# sourceMappingURL=prepareFunctionsUpload.js.map