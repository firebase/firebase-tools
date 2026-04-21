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
  if (emulator.localOnly) {
    EmulatorLogger.forEmulator(name).logLabeled(
      "WARN",
      name,
      `Env variable override detected, skipping download. Using ${emulator} emulator at ${emulator.binaryPath}`,
    );
    return;
  }
  const overrideVersion = downloadableEmulators.emulatorVersionOverride(name);
  if (overrideVersion) {
    EmulatorLogger.forEmulator(name).logLabeled(
      "WARN",
      name,
      `Env variable override detected. Using custom ${name} emulator version ${overrideVersion}.`,
    );
  }
  EmulatorLogger.forEmulator(name).logLabeled(
    "BULLET",
    name,
    `downloading ${path.basename(emulator.downloadPath)}...`,
  );
  fs.ensureDirSync(emulator.opts.cacheDir);

  let tmpfile: string;
  try {
    tmpfile = await downloadUtils.downloadToTmp(emulator.opts.remoteUrl, !!emulator.opts.auth);
  } catch (err: any) {
    if (overrideVersion && err instanceof FirebaseError && err.status === 404) {
      throw new FirebaseError(
        `env variable ${name.toUpperCase()}_EMULATOR_VERSION set to ${overrideVersion}, 
        but no such version of ${name} was found. Please double check the version number, or unset this environment variable to use the latest default.`,
      );
    }
    throw err;
  }

  if (!emulator.opts.skipChecksumAndSize) {
    await downloadUtils.validateSize(tmpfile, emulator.opts.expectedSize);
    await downloadUtils.validateChecksum(tmpfile, emulator.opts.expectedChecksum, "md5");
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

    if (!file.includes(emulator.opts.namePrefix)) {
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
