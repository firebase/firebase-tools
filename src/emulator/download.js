"use strict";

const FirebaseError = require("../error");
const crypto = require("crypto");
const emulatorConstants = require("./constants");
const fs = require("fs-extra");
const request = require("request");
const tmp = require("tmp");
const utils = require("../utils");

tmp.setGracefulCleanup();

module.exports = (name) => {
  const emulator = emulatorConstants.emulators[name];
  utils.logLabeledBullet(name, "downloading emulator...");
  fs.ensureDirSync(emulator.cacheDir);
  return downloadToTmp(emulator.remoteUrl).then((tmpfile) =>
    validateSize(tmpfile, emulator.expectedSize)
      .then(() => validateChecksum(tmpfile, emulator.expectedChecksum))
      .then(() => {
        fs.copySync(tmpfile, emulator.localPath);
        fs.chmodSync(emulator.localPath, 0o755);
      })
  );
};

/**
 * Downloads the resource at `remoteUrl` to a temporary file.
 * Resolves to the temporary file's name, rejects if there's any error.
 */
function downloadToTmp(remoteUrl) {
  return new Promise((resolve, reject) => {
    let tmpfile = tmp.fileSync();
    let req = request.get(remoteUrl);
    let writeStream = fs.createWriteStream(tmpfile.name);
    req.on("error", (err) => reject(err));
    req.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new FirebaseError(`download failed, status ${response.statusCode}`, { exit: 1 }));
      }
    });
    req.on("end", () => {
      writeStream.close();
      resolve(tmpfile.name);
    });
    req.pipe(writeStream);
  });
}

/**
 * Checks whether the file at `filepath` has the expected size.
 */
function validateSize(filepath, expectedSize) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filepath);
    return stat.size === expectedSize
      ? resolve()
      : reject(
          new FirebaseError(
            `download failed, expected ${expectedSize} bytes but got ${stat.size}`,
            { exit: 1 }
          )
        );
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
        : reject(
            new FirebaseError(
              `download failed, expected checksum ${expectedChecksum} but got ${checksum}`,
              { exit: 1 }
            )
          );
    });
  });
}
