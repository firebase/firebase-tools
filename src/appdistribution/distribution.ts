/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
    } catch (err: any) {
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
