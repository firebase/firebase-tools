import * as fs from "fs-extra";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as pathUtil from "path";

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
  AAB = "aab",
}

/**
 * Object representing an APK, AAB or IPA file. Used for uploading app distributions.
 */
export class Distribution {
  private readonly fileType: DistributionFileType;
  private readonly fileName: string;

  constructor(private readonly path: string) {
    if (!path) {
      throw new FirebaseError("must specify a release binary file");
    }

    const distributionType = path.split(".").pop();
    if (
      distributionType !== DistributionFileType.IPA &&
      distributionType !== DistributionFileType.APK &&
      distributionType !== DistributionFileType.AAB
    ) {
      throw new FirebaseError("Unsupported file format, should be .ipa, .apk or .aab");
    }

    let stat;
    try {
      stat = fs.statSync(path);
    } catch (err) {
      logger.info(err);
      throw new FirebaseError(`File ${path} does not exist: verify that file points to a binary`);
    }
    if (!stat.isFile()) {
      throw new FirebaseError(`${path} is not a file. Verify that it points to a binary.`);
    }

    this.path = path;
    this.fileType = distributionType;
    this.fileName = pathUtil.basename(path);
  }

  distributionFileType(): DistributionFileType {
    return this.fileType;
  }

  readStream(): fs.ReadStream {
    return fs.createReadStream(this.path);
  }

  getFileName(): string {
    return this.fileName;
  }
}
