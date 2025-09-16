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
exports.archiveDirectory = void 0;
const archiver = __importStar(require("archiver"));
const filesize = __importStar(require("filesize"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tar = __importStar(require("tar"));
const tmp = __importStar(require("tmp"));
const error_1 = require("./error");
const listFiles_1 = require("./listFiles");
const logger_1 = require("./logger");
const fsAsync = __importStar(require("./fsAsync"));
/**
 * Archives a directory to a temporary file and returns information about the
 * new archive. Defaults to type "tar", and returns a .tar.gz file.
 */
async function archiveDirectory(sourceDirectory, options = {}) {
    let postfix = ".tar.gz";
    if (options.type === "zip") {
        postfix = ".zip";
    }
    const tempFile = tmp.fileSync({
        prefix: "firebase-archive-",
        postfix,
    });
    if (!options.ignore) {
        options.ignore = [];
    }
    let makeArchive;
    if (options.type === "zip") {
        makeArchive = zipDirectory(sourceDirectory, tempFile, options);
    }
    else {
        makeArchive = tarDirectory(sourceDirectory, tempFile, options);
    }
    try {
        const archive = await makeArchive;
        logger_1.logger.debug(`Archived ${filesize(archive.size)} in ${sourceDirectory}.`);
        return archive;
    }
    catch (err) {
        if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError("Failed to create archive.", { original: (0, error_1.getError)(err) });
    }
}
exports.archiveDirectory = archiveDirectory;
/**
 * Archives a directory and returns information about the local archive.
 */
async function tarDirectory(sourceDirectory, tempFile, options) {
    const allFiles = (0, listFiles_1.listFiles)(sourceDirectory, options.ignore);
    // `tar` returns a `TypeError` if `allFiles` is empty. Let's check a feww things.
    try {
        fs.statSync(sourceDirectory);
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new error_1.FirebaseError(`Could not read directory "${sourceDirectory}"`);
        }
        throw err;
    }
    if (!allFiles.length) {
        throw new error_1.FirebaseError(`Cannot create a tar archive with 0 files from directory "${sourceDirectory}"`);
    }
    await tar.create({
        gzip: true,
        file: tempFile.name,
        cwd: sourceDirectory,
        follow: true,
        noDirRecurse: true,
        portable: true,
    }, allFiles);
    const stats = fs.statSync(tempFile.name);
    return {
        file: tempFile.name,
        stream: fs.createReadStream(tempFile.name),
        manifest: allFiles,
        size: stats.size,
        source: sourceDirectory,
    };
}
/**
 * Zips a directory and returns information about the local archive.
 */
async function zipDirectory(sourceDirectory, tempFile, options) {
    const archiveFileStream = fs.createWriteStream(tempFile.name, {
        flags: "w",
        encoding: "binary",
    });
    const archive = archiver("zip");
    const archiveDone = pipeAsync(archive, archiveFileStream);
    const allFiles = [];
    let files;
    try {
        files = await fsAsync.readdirRecursive({ path: sourceDirectory, ignore: options.ignore });
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new error_1.FirebaseError(`Could not read directory "${sourceDirectory}"`, { original: err });
        }
        throw err;
    }
    for (const file of files) {
        const name = path.relative(sourceDirectory, file.name);
        allFiles.push(name);
        archive.file(file.name, {
            name,
            mode: file.mode,
        });
    }
    void archive.finalize();
    await archiveDone;
    const stats = fs.statSync(tempFile.name);
    return {
        file: tempFile.name,
        stream: fs.createReadStream(tempFile.name),
        manifest: allFiles,
        size: stats.size,
        source: sourceDirectory,
    };
}
/**
 * Pipes one stream to another, resolving the returned promise on finish or
 * rejects on an error.
 */
async function pipeAsync(from, to) {
    return new Promise((resolve, reject) => {
        to.on("finish", resolve);
        to.on("error", reject);
        from.pipe(to);
    });
}
//# sourceMappingURL=archiveDirectory.js.map