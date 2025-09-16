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
exports.Persistence = void 0;
const fs_1 = require("fs");
const promises_1 = require("node:fs/promises");
const fs = __importStar(require("fs"));
const fse = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const uuid = __importStar(require("uuid"));
/**
 * Helper for disk I/O operations.
 * Assigns a unique identifier to each file and stores it on disk based on that identifier
 */
class Persistence {
    constructor(dirPath) {
        // Mapping from emulator filePaths to unique identifiers on disk
        this._diskPathMap = new Map();
        this.reset(dirPath);
    }
    reset(dirPath) {
        this._dirPath = dirPath;
        (0, fs_1.mkdirSync)(dirPath, {
            recursive: true,
        });
        this._diskPathMap = new Map();
    }
    get dirPath() {
        return this._dirPath;
    }
    appendBytes(fileName, bytes) {
        if (!this._diskPathMap.has(fileName)) {
            this._diskPathMap.set(fileName, this.generateNewDiskName());
        }
        const filepath = this.getDiskPath(fileName);
        fs.appendFileSync(filepath, bytes);
        return filepath;
    }
    readBytes(fileName, size, fileOffset) {
        let fd;
        try {
            fd = (0, fs_1.openSync)(this.getDiskPath(fileName), "r");
            const buf = Buffer.alloc(size);
            const offset = fileOffset && fileOffset > 0 ? fileOffset : 0;
            (0, fs_1.readSync)(fd, buf, 0, size, offset);
            return buf;
        }
        finally {
            if (fd) {
                (0, fs_1.closeSync)(fd);
            }
        }
    }
    deleteFile(fileName, failSilently = false) {
        try {
            (0, fs_1.unlinkSync)(this.getDiskPath(fileName));
        }
        catch (err) {
            if (!failSilently) {
                throw err;
            }
        }
        this._diskPathMap.delete(fileName);
    }
    async deleteAll() {
        await (0, promises_1.rm)(this._dirPath, { recursive: true });
        this._diskPathMap = new Map();
        return;
    }
    renameFile(oldName, newName) {
        const oldNameId = this.getDiskFileName(oldName);
        this._diskPathMap.set(newName, oldNameId);
        this._diskPathMap.delete(oldName);
    }
    getDiskPath(fileName) {
        const shortenedDiskPath = this.getDiskFileName(fileName);
        return path.join(this._dirPath, encodeURIComponent(shortenedDiskPath));
    }
    getDiskFileName(fileName) {
        return this._diskPathMap.get(fileName);
    }
    copyFromExternalPath(sourcePath, newName) {
        this._diskPathMap.set(newName, this.generateNewDiskName());
        fse.copyFileSync(sourcePath, this.getDiskPath(newName));
    }
    generateNewDiskName() {
        return uuid.v4();
    }
}
exports.Persistence = Persistence;
//# sourceMappingURL=persistence.js.map