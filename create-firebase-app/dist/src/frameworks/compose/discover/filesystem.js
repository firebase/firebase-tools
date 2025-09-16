"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readOrNull = exports.LocalFileSystem = void 0;
const fs_extra_1 = require("fs-extra");
const path = require("path");
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
        if (err && typeof err === "object" && (err === null || err === void 0 ? void 0 : err.code) === "ENOENT") {
            logger_1.logger.debug("ENOENT error occured while reading file.");
            return null;
        }
        throw new Error(`Unknown error occured while reading file: ${err}`);
    }
}
exports.readOrNull = readOrNull;
