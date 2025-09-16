"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveAll = exports.listFiles = exports.readFile = exports.dirExistsSync = exports.fileExistsSync = void 0;
const fs_1 = require("fs");
const path = require("path");
const error_1 = require("./error");
const fs_extra_1 = require("fs-extra");
function fileExistsSync(path) {
    try {
        return (0, fs_1.statSync)(path).isFile();
    }
    catch (e) {
        return false;
    }
}
exports.fileExistsSync = fileExistsSync;
function dirExistsSync(path) {
    try {
        return (0, fs_1.statSync)(path).isDirectory();
    }
    catch (e) {
        return false;
    }
}
exports.dirExistsSync = dirExistsSync;
function readFile(path) {
    try {
        return (0, fs_1.readFileSync)(path).toString();
    }
    catch (e) {
        if (e.code === "ENOENT") {
            throw new error_1.FirebaseError(`File not found: ${path}`);
        }
        throw e;
    }
}
exports.readFile = readFile;
function listFiles(path) {
    try {
        return (0, fs_1.readdirSync)(path);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            throw new error_1.FirebaseError(`Directory not found: ${path}`);
        }
        throw e;
    }
}
exports.listFiles = listFiles;
// Move all files and directories inside srcDir to destDir
function moveAll(srcDir, destDir) {
    if (!(0, fs_1.existsSync)(destDir)) {
        (0, fs_1.mkdirSync)(destDir, { recursive: true });
    }
    const files = listFiles(srcDir);
    for (const f of files) {
        const srcPath = path.join(srcDir, f);
        if (srcPath === destDir)
            continue;
        (0, fs_extra_1.moveSync)(srcPath, path.join(destDir, f));
    }
}
exports.moveAll = moveAll;
