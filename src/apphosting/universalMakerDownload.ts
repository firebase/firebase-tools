import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { FirebaseError } from "../error";
import * as downloadUtils from "../downloadUtils";
import { logger } from "../logger";
import * as universalMakerInfo from "./universalMakerInfo.json";

const CACHE_DIR = path.join(os.homedir(), ".cache", "firebase", "universal-maker");

interface UniversalMakerUpdateDetails {
  version: string;
  expectedSize: number;
  expectedChecksumSHA256: string;
  remoteUrl: string;
  downloadPathRelativeToCacheDir: string;
}

const UNIVERSAL_MAKER_UPDATE_DETAILS: Record<string, UniversalMakerUpdateDetails> =
  universalMakerInfo;

function getPlatformInfo(): UniversalMakerUpdateDetails {
  let platformKey = "";
  if (process.platform === "darwin") {
    if (process.arch === "arm64") {
      platformKey = "darwin_arm64";
    } else {
      throw new FirebaseError(
        "macOS Intel (darwin_x64) is not currently supported for Universal Maker.",
      );
    }
  } else if (process.platform === "linux") {
    if (process.arch === "x64") {
      platformKey = "linux_x64";
    } else {
      throw new FirebaseError(
        "Linux ARM (linux_arm64) is not currently supported for Universal Maker.",
      );
    }
  } else if (process.platform === "win32") {
    throw new FirebaseError("Windows (win32) is not currently supported for Universal Maker.");
  } else {
    throw new FirebaseError(
      `Unsupported platform for Universal Maker: ${process.platform} ${process.arch}`,
    );
  }

  const details = UNIVERSAL_MAKER_UPDATE_DETAILS[platformKey];
  if (!details) {
    throw new FirebaseError(`Could not find download details for platform: ${platformKey}`);
  }

  return details;
}

/**
 * Gets the path to the Universal Maker binary, downloading it if necessary.
 */
export async function getOrDownloadUniversalMaker(): Promise<string> {
  const details = getPlatformInfo();
  const downloadPath = path.join(CACHE_DIR, details.downloadPathRelativeToCacheDir);

  const hasBinary = fs.existsSync(downloadPath);

  if (hasBinary) {
    logger.debug(`[apphosting] Universal Maker binary found at cache: ${downloadPath}`);
    try {
      await downloadUtils.validateSize(downloadPath, details.expectedSize);
      await downloadUtils.validateChecksum(downloadPath, details.expectedChecksumSHA256, "sha256");
      return downloadPath;
    } catch (err) {
      logger.warn(
        `[apphosting] Cached Universal Maker binary failed verification: ${(err as Error).message}. Proceeding to redownload...`,
      );
    }
  }

  logger.info(
    "Downloading Universal Maker, a tool required to build your App Hosting application locally...",
  );
  fs.ensureDirSync(CACHE_DIR);

  let tmpfile: string;
  try {
    tmpfile = await downloadUtils.downloadToTmp(details.remoteUrl);
  } catch (err: any) {
    throw new FirebaseError(`Failed to download Universal Maker: ${(err as Error).message}`);
  }

  await downloadUtils.validateSize(tmpfile, details.expectedSize);
  await downloadUtils.validateChecksum(tmpfile, details.expectedChecksumSHA256, "sha256");

  // Move to cache dir
  fs.copySync(tmpfile, downloadPath);

  // Make it executable
  fs.chmodSync(downloadPath, 0o755);

  return downloadPath;
}
