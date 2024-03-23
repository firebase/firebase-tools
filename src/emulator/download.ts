import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import * as tmp from "tmp";

import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorDownloadDetails, DownloadableEmulators } from "./types";
import { FirebaseError } from "../error";
import { unzip } from "../unzip";
import * as downloadableEmulators from "./downloadableEmulators";
import * as downloadUtils from "../downloadUtils";

tmp.setGracefulCleanup();

export async function downloadEmulator(name: DownloadableEmulators): Promise<void> {
  const emulator = downloadableEmulators.getDownloadDetails(name);
  EmulatorLogger.forEmulator(name).logLabeled(
    "BULLET",
    name,
    `downloading ${path.basename(emulator.downloadPath)}...`,
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

export async function downloadExtensionVersion(
  extensionVersionRef: string,
  sourceDownloadUri: string,
  targetDir: string,
): Promise<void> {
  const emulatorLogger = EmulatorLogger.forExtension({ ref: extensionVersionRef });
  emulatorLogger.logLabeled(
    "BULLET",
    "extensions",
    `Starting download for ${extensionVersionRef} source code to ${targetDir}..`,
  );
  try {
    fs.mkdirSync(targetDir);
  } catch (err) {
    emulatorLogger.logLabeled(
      "BULLET",
      "extensions",
      `cache directory for ${extensionVersionRef} already exists...`,
    );
  }
  emulatorLogger.logLabeled("BULLET", "extensions", `downloading ${sourceDownloadUri}...`);
  const sourceCodeZip = await downloadUtils.downloadToTmp(sourceDownloadUri);
  await unzip(sourceCodeZip, targetDir);
  fs.chmodSync(targetDir, 0o755);

  emulatorLogger.logLabeled("BULLET", "extensions", `Downloaded to ${targetDir}...`);
  // TODO: We should not need to do this wait
  // However, when I remove this, unzipDir doesn't contain everything yet.
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

function removeOldFiles(
  name: DownloadableEmulators,
  emulator: EmulatorDownloadDetails,
  removeAllVersions = false,
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
        `Removing outdated emulator files: ${file}`,
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
            { exit: 1 },
          ),
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
              { exit: 1 },
            ),
          );
    });
  });
}
