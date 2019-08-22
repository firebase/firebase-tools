import * as fs from "fs-extra";
import { FirebaseError } from "../error";
import * as crypto from "crypto";

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

    if (!fs.existsSync(path)) {
      throw new FirebaseError(
        `File ${path} does not exist: verify that file points to a distribution`
      );
    }

    this.path = path;
    this.fileType = distributionType;
  }

  fileSize(): number {
    return fs.statSync(this.path).size;
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

  async releaseHash(): Promise<string> {
    return new Promise<string>((resolve) => {
      const hash = crypto.createHash("sha1");
      const stream = this.readStream();
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => {
        return resolve(hash.digest("hex"));
      });
    });
  }
}
