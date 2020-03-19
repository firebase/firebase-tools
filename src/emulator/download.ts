import * as crypto from "crypto";
import * as request from "request";
import * as ProgressBar from "progress";

import { FirebaseError } from "../error";
import * as utils from "../utils";
import { Emulators, EmulatorDownloadDetails } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import * as tmp from "tmp";
import * as fs from "fs-extra";
import * as path from "path";
import * as unzipper from "unzipper";

tmp.setGracefulCleanup();

type DownloadableEmulator = Emulators.FIRESTORE | Emulators.DATABASE | Emulators.PUBSUB;

module.exports = async (name: DownloadableEmulator) => {
  const emulator = downloadableEmulators.getDownloadDetails(name);
  utils.logLabeledBullet(name, `downloading ${path.basename(emulator.downloadPath)}...`);
  fs.ensureDirSync(emulator.opts.cacheDir);

  const tmpfile = await downloadToTmp(emulator.opts.remoteUrl);
  await validateSize(tmpfile, emulator.opts.expectedSize);
  await validateChecksum(tmpfile, emulator.opts.expectedChecksum);

  fs.copySync(tmpfile, emulator.downloadPath);

  if (emulator.unzipDir) {
    await unzip(emulator.downloadPath, emulator.unzipDir);
  }

  const executablePath = emulator.binaryPath || emulator.downloadPath;
  fs.chmodSync(executablePath, 0o755);

  await removeOldFiles(name, emulator);
};

function unzip(zipPath: string, unzipDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: unzipDir }))
      .on("error", reject)
      .on("finish", resolve);
  });
}

function removeOldFiles(name: DownloadableEmulator, emulator: EmulatorDownloadDetails): void {
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

    if (fullFilePath !== currentLocalPath && fullFilePath !== currentUnzipPath) {
      utils.logLabeledBullet(name, `Removing outdated emulator files: ${file}`);
      fs.removeSync(fullFilePath);
    }
  }
}

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

    let bar: ProgressBar;

    req.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new FirebaseError(`download failed, status ${response.statusCode}`, { exit: 1 }));
      }

      const total = parseInt(response.headers["content-length"] || "0", 10);
      const totalMb = Math.ceil(total / 1000000);
      bar = new ProgressBar(`Progress: :bar (:percent of ${totalMb}MB)`, { total, head: ">" });
    });

    req.on("data", (chunk) => {
      if (bar) {
        bar.tick(chunk.length);
      }
    });

    writeStream.on("finish", () => {
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
