"use strict";

const FirebaseError = require("../error");
const fs = require("fs-extra");
const tmp = require("tmp");
const request = require("request");
const emulatorConstants = require("./constants");
const utils = require("../utils");

tmp.setGracefulCleanup();

module.exports = (name) => {
  return new Promise((resolve, reject) => {
    utils.logLabeledBullet(name, "downloading emulator...");
    let emulator = emulatorConstants.emulators[name];
    fs.ensureDirSync(emulator.cacheDir);

    let tmpFile = tmp.fileSync();
    let req = request.get(emulator.remoteUrl);
    let writeStream = fs.createWriteStream(tmpFile.name);
    req.on("error", (err) => reject(err));
    req.on("response", (response) => {
      if (response.statusCode != 200) {
        reject(new FirebaseError(`download failed, status ${response.statusCode}`, { exit: 1 }));
      }
    });
    req.on("end", () => {
      writeStream.close();
      const stat = fs.statSync(tmpFile.name);
      if (stat.size != emulator.expectedSize) {
        reject(
          new FirebaseError(
            `download failed, expected ${emulator.expectedSize} bytes but got ${stat.size}`,
            { exit: 1 }
          )
        );
      } else {
        fs.copySync(tmpFile.name, emulator.localPath);
        fs.chmodSync(emulator.localPath, 0o755);
        resolve();
      }
    });
    req.pipe(writeStream);
  });
};
