import * as fs from "fs-extra";
import { logger } from "../logger";
import * as pathUtil from "path";
import * as utils from "../utils";
import { UploadReleaseResult, TestDevice, ReleaseTest } from "../appdistribution/types";
import { AppDistributionClient } from "./client";
import { FirebaseError, getErrMsg, getErrStatus } from "../error";

const TEST_MAX_POLLING_RETRIES = 40;
const TEST_POLLING_INTERVAL_MILLIS = 30_000;

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
  AAB = "aab",
}

export async function upload(
  requests: AppDistributionClient,
  appName: string,
  distribution: Distribution,
): Promise<string> {
  utils.logBullet("uploading binary...");
  try {
    const operationName = await requests.uploadRelease(appName, distribution);

    // The upload process is asynchronous, so poll to figure out when the upload has finished successfully
    const uploadResponse = await requests.pollUploadStatus(operationName);

    const release = uploadResponse.release;
    switch (uploadResponse.result) {
      case UploadReleaseResult.RELEASE_CREATED:
        utils.logSuccess(
          `uploaded new release ${release.displayVersion} (${release.buildVersion}) successfully!`,
        );
        break;
      case UploadReleaseResult.RELEASE_UPDATED:
        utils.logSuccess(
          `uploaded update to existing release ${release.displayVersion} (${release.buildVersion}) successfully!`,
        );
        break;
      case UploadReleaseResult.RELEASE_UNMODIFIED:
        utils.logSuccess(
          `re-uploaded already existing release ${release.displayVersion} (${release.buildVersion}) successfully!`,
        );
        break;
      default:
        utils.logSuccess(
          `uploaded release ${release.displayVersion} (${release.buildVersion}) successfully!`,
        );
    }
    utils.logSuccess(`View this release in the Firebase console: ${release.firebaseConsoleUri}`);
    utils.logSuccess(`Share this release with testers who have access: ${release.testingUri}`);
    utils.logSuccess(
      `Download the release binary (link expires in 1 hour): ${release.binaryDownloadUri}`,
    );
    return uploadResponse.release.name;
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw new FirebaseError(
        `App Distribution could not find your app ${appName}. ` +
          `Make sure to onboard your app by pressing the "Get started" ` +
          "button on the App Distribution page in the Firebase console: " +
          "https://console.firebase.google.com/project/_/appdistribution",
        { exit: 1 },
      );
    }
    throw new FirebaseError(`Failed to upload release. ${getErrMsg(err)}`, { exit: 1 });
  }
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
    } catch (err: unknown) {
      logger.info(getErrMsg(err));
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

export async function awaitTestResults(
  releaseTests: ReleaseTest[],
  requests: AppDistributionClient,
): Promise<void> {
  const releaseTestNames = new Set(
    releaseTests.map((rt) => rt.name).filter((n): n is string => !!n),
  );
  for (let i = 0; i < TEST_MAX_POLLING_RETRIES; i++) {
    utils.logBullet(`${releaseTestNames.size} automated test results are pending...`);
    await delay(TEST_POLLING_INTERVAL_MILLIS);
    for (const releaseTestName of releaseTestNames) {
      const releaseTest = await requests.getReleaseTest(releaseTestName);
      if (releaseTest.deviceExecutions.every((e) => e.state === "PASSED")) {
        releaseTestNames.delete(releaseTestName);
        if (releaseTestNames.size === 0) {
          utils.logSuccess("Automated test(s) passed!");
          return;
        } else {
          continue;
        }
      }
      for (const execution of releaseTest.deviceExecutions) {
        const device = deviceToString(execution.device);
        switch (execution.state) {
          case "PASSED":
          case "IN_PROGRESS":
            continue;
          case "FAILED":
            throw new FirebaseError(
              `Automated test failed for ${device}: ${execution.failedReason}`,
              { exit: 1 },
            );
          case "INCONCLUSIVE":
            throw new FirebaseError(
              `Automated test inconclusive for ${device}: ${execution.inconclusiveReason}`,
              { exit: 1 },
            );
          default:
            throw new FirebaseError(
              `Unsupported automated test state for ${device}: ${execution.state}`,
              { exit: 1 },
            );
        }
      }
    }
  }
  throw new FirebaseError("It took longer than expected to run your test(s), please try again.", {
    exit: 1,
  });
}

function delay(ms: number): Promise<number> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deviceToString(device: TestDevice): string {
  return `${device.model} (${device.version}/${device.orientation}/${device.locale})`;
}
