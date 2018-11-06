"use strict";

const fs = require("fs-extra");
const request = require("request");
const emulatorConstants = require("./constants");
const utils = require("../utils");

module.exports = (name) => {
  return new Promise((resolve, reject) => {
    utils.logLabeledBullet(name, "downloading emulator...");
    let emulator = emulatorConstants.emulators[name];
    fs.ensureDirSync(emulator.cacheDir);
    let req = request.get(emulator.remoteUrl);
    let writeStream = fs.createWriteStream(emulator.localPath);
    req.on("error", (err) => reject(err));
    req.on("end", () => {
      writeStream.close();
      fs.chmodSync(emulator.localPath, 0o755);
      resolve();
    });
    req.pipe(writeStream);
  });
};
