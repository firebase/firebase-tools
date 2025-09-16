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
exports.moveAll = exports.listFiles = exports.readFile = exports.dirExistsSync = exports.fileExistsSync = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
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
//# sourceMappingURL=fsutils.js.map