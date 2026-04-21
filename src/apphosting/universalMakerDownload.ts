import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { FirebaseError } from "../error";
import * as downloadUtils from "../downloadUtils";
import { logger } from "../logger";
import * as universalMakerInfo from "./universalMakerInfo.json";

const CACHE_DIR =
  process.env.FIREBASE_UNIVERSAL_MAKER_PATH ||
  path.join(os.homedir(), ".cache", "firebase", "universal-maker");

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
 * Checks whether the file at `filepath` has the expected SHA256 checksum.
 */
function validateChecksumSHA256(filepath: string, expectedChecksum: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
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

/**
 * Gets the path to the Universal Maker binary, downloading it if necessary.
 */
export async function getOrDownloadUniversalMaker(): Promise<string> {
  if (process.env.UNIVERSAL_MAKER_BINARY) {
    logger.debug(
      `[apphosting] Env variable override detected. Using Universal Maker binary at ${process.env.UNIVERSAL_MAKER_BINARY}`,
    );
    return process.env.UNIVERSAL_MAKER_BINARY;
  }

  const details = getPlatformInfo();
  const downloadPath = path.join(CACHE_DIR, details.downloadPathRelativeToCacheDir);

  const hasBinary = fs.existsSync(downloadPath);

  if (hasBinary) {
    logger.debug(`[apphosting] Universal Maker binary found at cache: ${downloadPath}`);
    return downloadPath;
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

  await validateSize(tmpfile, details.expectedSize);
  await validateChecksumSHA256(tmpfile, details.expectedChecksumSHA256);

  // Move to cache dir
  fs.copySync(tmpfile, downloadPath);

  // Make it executable
  fs.chmodSync(downloadPath, 0o755);

  return downloadPath;
}
