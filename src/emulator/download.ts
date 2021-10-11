import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import * as tmp from "tmp";
import * as unzipper from "unzipper";

import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorDownloadDetails, DownloadableEmulators } from "./types";
import { FirebaseError } from "../error";
import * as downloadableEmulators from "./downloadableEmulators";
import * as downloadUtils from "../downloadUtils";

tmp.setGracefulCleanup();

export async function downloadEmulator(name: DownloadableEmulators): Promise<void> {
  const emulator = downloadableEmulators.getDownloadDetails(name);
  EmulatorLogger.forEmulator(name).logLabeled(
    "BULLET",
    name,
    `downloading ${path.basename(emulator.downloadPath)}...`
  );
  fs.ensureDirSync(emulator.opts.cacheDir);

  const tmpfile = await downloadUtils.downloadToTmp(emulator.opts.remoteUrl);

  if (!emulator.opts.skipChecksumAndSize) {
    await validateSize(tmpfile, emulator.opts.expectedSize);
    await validateChecksum(tmpfile, emulator.opts.expectedChecksum);
  }
  if (emulator.opts.skipCache) {
    removeOldFiles(name, emulator, true);
  }

  fs.copySync(tmpfile, emulator.downloadPath);

  if (emulator.unzipDir) {
    await unzip(emulator.downloadPath, emulator.unzipDir);
  }

  const executablePath = emulator.binaryPath || emulator.downloadPath;
  fs.chmodSync(executablePath, 0o755);

  removeOldFiles(name, emulator);
}

function unzip(zipPath: string, unzipDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: unzipDir })) // eslint-disable-line new-cap
      .on("error", reject)
      .on("finish", resolve);
  });
}

function removeOldFiles(
  name: DownloadableEmulators,
  emulator: EmulatorDownloadDetails,
  removeAllVersions = false
): void {
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

    if (
      (fullFilePath !== currentLocalPath && fullFilePath !== currentUnzipPath) ||
      removeAllVersions
    ) {
      EmulatorLogger.forEmulator(name).logLabeled(
        "BULLET",
        name,
        `Removing outdated emulator files: ${file}`
      );
      fs.removeSync(fullFilePath);
    }
  }
}

/**
 * Checks whether the file at `filepath` has the expected size.
 */
function validateSize(filepath: string, expectedSize: number): Promise<void> {
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
function validateChecksum(filepath: string, expectedChecksum: string): Promise<void> {
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
