import * as fs from "fs-extra";
import { FirebaseError } from "../error";
import * as crypto from "crypto";
import { AppDistributionApp } from "./client";
import * as logger from "../logger";

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
}

/**
 * Object representing an APK or IPa file. Used for uploading app distributions.
 */
export class Distribution {
  private readonly fileType: DistributionFileType;

  constructor(private readonly path: string) {
    if (!path) {
      throw new FirebaseError("must specify a distribution file");
    }

    const distributionType = path.split(".").pop();
    if (
      distributionType !== DistributionFileType.IPA &&
      distributionType !== DistributionFileType.APK
    ) {
      throw new FirebaseError("unsupported distribution file format, should be .ipa or .apk");
    }

    try {
      fs.ensureFileSync(path);
    } catch (err) {
      logger.info(err);
      throw new FirebaseError(
        `${path} is not a file. Verify that it points to a distribution binary.`
      );
    }

    this.path = path;
    this.fileType = distributionType;
  }

  readStream(): fs.ReadStream {
    return fs.createReadStream(this.path);
  }

  platform(): string {
    switch (this.fileType) {
      case DistributionFileType.IPA:
        return "ios";
      case DistributionFileType.APK:
        return "android";
      default:
        throw new FirebaseError("Unsupported distribution file format, should be .ipa or .apk");
    }
  }

  /**
   * Returns the binary name in the format:
   * projects/<project-number>/apps/<app-id>/releases/-/binaries/<sha-256-hash>
   *
   * This is used to check the distribution upload status.
   */
  binaryName(app: AppDistributionApp): Promise<string> {
    return new Promise<string>((resolve) => {
      const hash = crypto.createHash("sha256");
      const stream = this.readStream();
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => {
        return resolve(
          `projects/${app.projectNumber}/apps/${app.appId}/releases/-/binaries/${hash.digest(
            "hex"
          )}`
        );
      });
    });
  }
}
