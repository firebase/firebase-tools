import { URL } from "url";
import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import * as ProgressBar from "progress";
import * as tmp from "tmp";
import * as unzipper from "unzipper";

import { Client } from "../apiv2";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators, EmulatorDownloadDetails } from "./types";
import { FirebaseError } from "../error";
import * as downloadableEmulators from "./downloadableEmulators";

tmp.setGracefulCleanup();

type DownloadableEmulator = Emulators.FIRESTORE | Emulators.DATABASE | Emulators.PUBSUB;

module.exports = async (name: DownloadableEmulator) => {
  const emulator = downloadableEmulators.getDownloadDetails(name);
  EmulatorLogger.forEmulator(name).logLabeled(
    "BULLET",
    name,
    `downloading ${path.basename(emulator.downloadPath)}...`
  );
  fs.ensureDirSync(emulator.opts.cacheDir);

  const tmpfile = await downloadToTmp(emulator.opts.remoteUrl);

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
};

function unzip(zipPath: string, unzipDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: unzipDir })) // eslint-disable-line new-cap
      .on("error", reject)
      .on("finish", resolve);
  });
}

function removeOldFiles(
  name: DownloadableEmulator,
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
 * Downloads the resource at `remoteUrl` to a temporary file.
 * Resolves to the temporary file's name, rejects if there's any error.
 * @param remoteUrl URL to download.
 */
async function downloadToTmp(remoteUrl: string): Promise<string> {
  const u = new URL(remoteUrl);
  const c = new Client({ urlPrefix: u.origin, auth: false });
  const tmpfile = tmp.fileSync();
  const writeStream = fs.createWriteStream(tmpfile.name);

  const res = await c.request<void, NodeJS.ReadableStream>({
    method: "GET",
    path: u.pathname,
    responseType: "stream",
    resolveOnHTTPError: true,
  });
  if (res.status !== 200) {
    throw new FirebaseError(`download failed, status ${res.status}`, { exit: 1 });
  }

  const total = parseInt(res.response.headers.get("content-length") || "0", 10);
  const totalMb = Math.ceil(total / 1000000);
  const bar = new ProgressBar(`Progress: :bar (:percent of ${totalMb}MB)`, { total, head: ">" });

  res.body.on("data", (chunk) => {
    bar.tick(chunk.length);
  });

  await new Promise((resolve) => {
    writeStream.on("finish", resolve);
    res.body.pipe(writeStream);
  });

  return tmpfile.name;
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
