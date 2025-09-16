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
exports.readOrNull = exports.LocalFileSystem = void 0;
const fs_extra_1 = require("fs-extra");
const path = __importStar(require("path"));
const error_1 = require("../../../error");
const logger_1 = require("../../../logger");
/**
 * Find files or read file contents present in the directory.
 */
class LocalFileSystem {
    constructor(cwd) {
        this.cwd = cwd;
        this.existsCache = {};
        this.contentCache = {};
    }
    async exists(file) {
        try {
            if (!(file in this.contentCache)) {
                this.existsCache[file] = await (0, fs_extra_1.pathExists)(path.resolve(this.cwd, file));
            }
            return this.existsCache[file];
        }
        catch (error) {
            throw new error_1.FirebaseError(`Error occured while searching for file: ${error}`);
        }
    }
    async read(file) {
        try {
            if (!(file in this.contentCache)) {
                const fileContents = await (0, fs_extra_1.readFile)(path.resolve(this.cwd, file), "utf-8");
                this.contentCache[file] = fileContents;
            }
            return this.contentCache[file];
        }
        catch (error) {
            logger_1.logger.error("Error occured while reading file contents.");
            throw error;
        }
    }
}
exports.LocalFileSystem = LocalFileSystem;
/**
 * Convert ENOENT errors into null
 */
async function readOrNull(fs, path) {
    try {
        return fs.read(path);
    }
    catch (err) {
        if (err && typeof err === "object" && err?.code === "ENOENT") {
            logger_1.logger.debug("ENOENT error occured while reading file.");
            return null;
        }
        throw new Error(`Unknown error occured while reading file: ${err}`);
    }
}
exports.readOrNull = readOrNull;
//# sourceMappingURL=filesystem.js.map