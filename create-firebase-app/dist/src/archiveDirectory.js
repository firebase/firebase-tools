"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveDirectory = void 0;
const archiver = require("archiver");
const filesize = require("filesize");
const fs = require("fs");
const path = require("path");
const tar = require("tar");
const tmp = require("tmp");
const error_1 = require("./error");
const listFiles_1 = require("./listFiles");
const logger_1 = require("./logger");
const fsAsync = require("./fsAsync");
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
