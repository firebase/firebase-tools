import * as fs from "fs-extra";
import { FirebaseError } from "../error";

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
}

/**
 * Object representing an APK or IPa file. Used for uploading app distributions.
 */
export class Distribution {
  constructor(private readonly path: string, private readonly fileType: DistributionFileType) {
    this.path = path;
    this.fileType = fileType;
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
}
