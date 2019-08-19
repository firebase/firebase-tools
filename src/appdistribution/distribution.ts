import * as fs from "fs";
import { ReadStream } from "fs";

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
}

export class Distribution {
  path: string;
  fileType: DistributionFileType;

  constructor(path: string, fileType: DistributionFileType) {
    this.path = path;
    this.fileType = fileType;
  }

  fileSize(): number {
    return fs.statSync(this.path).size;
  }

  readStream(): ReadStream {
    return fs.createReadStream(this.path);
  }

  platform(): string {
    switch (this.fileType) {
      case DistributionFileType.IPA:
        return "ios";
      case DistributionFileType.APK:
        return "android";
    }
  }
}
