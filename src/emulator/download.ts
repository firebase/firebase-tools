"use strict";

import * as crypto from "crypto";
import * as request from "request";

import * as FirebaseError from "../error";
import * as utils from "../utils";
import { Emulators } from "./types";
import * as javaEmulators from "../serve/javaEmulators";
import * as tmp from "tmp";
import * as fs from "fs-extra";

tmp.setGracefulCleanup();

type DownloadableEmulator = Emulators.FIRESTORE | Emulators.DATABASE;

module.exports = (name: DownloadableEmulator) => {
  const emulator = javaEmulators.get(name);
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
function downloadToTmp(remoteUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpfile = tmp.fileSync();
    const req = request.get(remoteUrl);
    const writeStream = fs.createWriteStream(tmpfile.name);
    req.on("error", (err: any) => reject(err));
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
async function validateSize(filepath: string, expectedSize: number): Promise<void> {
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
async function validateChecksum(filepath: string, expectedChecksum: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filepath);
    stream.on("data", (data: any) => hash.update(data));
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
