"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExtensionVersion = exports.downloadEmulator = void 0;
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const tmp = require("tmp");
const emulatorLogger_1 = require("./emulatorLogger");
const error_1 = require("../error");
const unzip_1 = require("../unzip");
const downloadableEmulators = require("./downloadableEmulators");
const downloadUtils = require("../downloadUtils");
tmp.setGracefulCleanup();
async function downloadEmulator(name) {
    const emulator = downloadableEmulators.getDownloadDetails(name);
    if (emulator.localOnly) {
        emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("WARN", name, `Env variable override detected, skipping download. Using ${emulator} emulator at ${emulator.binaryPath}`);
        return;
    }
    emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("BULLET", name, `downloading ${path.basename(emulator.downloadPath)}...`);
    fs.ensureDirSync(emulator.opts.cacheDir);
    const tmpfile = await downloadUtils.downloadToTmp(emulator.opts.remoteUrl, !!emulator.opts.auth);
    if (!emulator.opts.skipChecksumAndSize) {
        await validateSize(tmpfile, emulator.opts.expectedSize);
        await validateChecksum(tmpfile, emulator.opts.expectedChecksum);
    }
    if (emulator.opts.skipCache) {
        removeOldFiles(name, emulator, true);
    }
    fs.copySync(tmpfile, emulator.downloadPath);
    if (emulator.unzipDir) {
        await (0, unzip_1.unzip)(emulator.downloadPath, emulator.unzipDir);
    }
    const executablePath = emulator.binaryPath || emulator.downloadPath;
    fs.chmodSync(executablePath, 0o755);
    removeOldFiles(name, emulator);
}
exports.downloadEmulator = downloadEmulator;
async function downloadExtensionVersion(extensionVersionRef, sourceDownloadUri, targetDir) {
    const emulatorLogger = emulatorLogger_1.EmulatorLogger.forExtension({ ref: extensionVersionRef });
    emulatorLogger.logLabeled("BULLET", "extensions", `Starting download for ${extensionVersionRef} source code to ${targetDir}..`);
    try {
        fs.mkdirSync(targetDir);
    }
    catch (err) {
        emulatorLogger.logLabeled("BULLET", "extensions", `cache directory for ${extensionVersionRef} already exists...`);
    }
    emulatorLogger.logLabeled("BULLET", "extensions", `downloading ${sourceDownloadUri}...`);
    const sourceCodeZip = await downloadUtils.downloadToTmp(sourceDownloadUri);
    await (0, unzip_1.unzip)(sourceCodeZip, targetDir);
    fs.chmodSync(targetDir, 0o755);
    emulatorLogger.logLabeled("BULLET", "extensions", `Downloaded to ${targetDir}...`);
    // TODO: We should not need to do this wait
    // However, when I remove this, unzipDir doesn't contain everything yet.
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
exports.downloadExtensionVersion = downloadExtensionVersion;
function removeOldFiles(name, emulator, removeAllVersions = false) {
    const currentLocalPath = emulator.downloadPath;
    const currentUnzipPath = emulator.unzipDir;
    const files = fs.readdirSync(emulator.opts.cacheDir);
    for (const file of files) {
        const fullFilePath = path.join(emulator.opts.cacheDir, file);
        if (file.indexOf(emulator.opts.namePrefix) < 0) {
            // This file is not related to this emulator, could be a JAR
            // from a different emulator or just a random file.
            continue;
        }
        if ((fullFilePath !== currentLocalPath && fullFilePath !== currentUnzipPath) ||
            removeAllVersions) {
            emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("BULLET", name, `Removing outdated emulator files: ${file}`);
            fs.removeSync(fullFilePath);
        }
    }
}
/**
 * Checks whether the file at `filepath` has the expected size.
 */
function validateSize(filepath, expectedSize) {
    return new Promise((resolve, reject) => {
        const stat = fs.statSync(filepath);
        return stat.size === expectedSize
            ? resolve()
            : reject(new error_1.FirebaseError(`download failed, expected ${expectedSize} bytes but got ${stat.size}`, { exit: 1 }));
    });
}
/**
 * Checks whether the file at `filepath` has the expected checksum.
 */
function validateChecksum(filepath, expectedChecksum) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(filepath);
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => {
            const checksum = hash.digest("hex");
            return checksum === expectedChecksum
                ? resolve()
                : reject(new error_1.FirebaseError(`download failed, expected checksum ${expectedChecksum} but got ${checksum}`, { exit: 1 }));
        });
    });
}
