import * as fs from "fs-extra";
import { logger } from "../logger";
import * as pathUtil from "path";
import * as utils from "../utils";
import { UploadReleaseResult, TestDevice, ReleaseTest, Release } from "../appdistribution/types";
import { AppDistributionClient } from "./client";
import { FirebaseError, getErrMsg, getErrStatus } from "../error";

const TEST_MAX_POLLING_RETRIES = 40;
const TEST_POLLING_INTERVAL_MILLIS = 30_000;

export enum DistributionFileType {
  IPA = "ipa",
  APK = "apk",
  AAB = "aab",
}

/** Upload a distribution */
export async function upload(
  requests: AppDistributionClient,
  appName: string,
  distribution: Distribution,
): Promise<Release> {
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
    return uploadResponse.release;
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

export interface DeviceExecutionResult {
  device: string;
  state: string;
  failedReason?: string;
  inconclusiveReason?: string;
  actionsJsonGcsUri?: string;
}

export interface TestCaseResult {
  displayName: string;
  releaseTestName?: string;
  passed: boolean;
  deviceExecutions: DeviceExecutionResult[];
}

export interface TestResultSummary {
  passed: boolean;
  totalTestCases: number;
  passCount: number;
  failCount: number;
  testCases: TestCaseResult[];
}

/** Wait for release tests to complete */
export async function awaitTestResults(
  releaseTests: ReleaseTest[],
  requests: AppDistributionClient,
  resultsFilePath?: string,
): Promise<TestResultSummary> {
  const pendingReleaseTestNames = new Set(
    releaseTests.map((rt) => rt.name).filter((n): n is string => !!n),
  );
  const completedReleaseTests = new Map<string, ReleaseTest>();

  for (let i = 0; i < TEST_MAX_POLLING_RETRIES; i++) {
    if (pendingReleaseTestNames.size === 0) {
      break;
    }
    utils.logBullet(`${pendingReleaseTestNames.size} automated test(s) pending completion...`);
    await delay(TEST_POLLING_INTERVAL_MILLIS);

    for (const releaseTestName of Array.from(pendingReleaseTestNames)) {
      const releaseTest = await requests.getReleaseTest(releaseTestName);
      const isFinished = releaseTest.deviceExecutions.every(
        (e) => e.state && e.state !== "IN_PROGRESS",
      );
      if (isFinished) {
        pendingReleaseTestNames.delete(releaseTestName);
        completedReleaseTests.set(releaseTestName, releaseTest);

        const displayName = releaseTest.displayName || releaseTestName;
        const allPassed = releaseTest.deviceExecutions.every((e) => e.state === "PASSED");
        if (allPassed) {
          const deviceList = releaseTest.deviceExecutions
            .map((e) => deviceToString(e.device))
            .join(", ");
          utils.logSuccess(`✔ Passed: "${displayName}" (${deviceList})`);
        } else {
          const failedExecs = releaseTest.deviceExecutions.filter((e) => e.state !== "PASSED");
          for (const exec of failedExecs) {
            const devStr = deviceToString(exec.device);
            const reason = exec.failedReason || exec.inconclusiveReason || exec.state || "Failed";
            utils.logWarning(`✖ Failed: "${displayName}" on ${devStr}: ${reason}`);
            const gcsUri = formatActionsGcsUri(
              releaseTest.resultsBucket,
              releaseTest.name,
              exec.device.model,
            );
            if (gcsUri) {
              logger.info(`   Log / Actions detail: ${gcsUri}`);
            }
          }
        }
      }
    }
  }

  if (pendingReleaseTestNames.size > 0) {
    throw new FirebaseError("It took longer than expected to run your test(s), please try again.", {
      exit: 1,
    });
  }

  const summaryTestCases: TestCaseResult[] = [];
  let totalFailures = 0;
  let totalPasses = 0;

  for (const rt of releaseTests) {
    const name = rt.name;
    const finalRt = (name && completedReleaseTests.get(name)) || rt;
    const displayName = finalRt.displayName || name || "Test Case";
    const casePassed =
      finalRt.deviceExecutions.length > 0 &&
      finalRt.deviceExecutions.every((e) => e.state === "PASSED");

    if (casePassed) {
      totalPasses++;
    } else {
      totalFailures++;
    }

    summaryTestCases.push({
      displayName,
      releaseTestName: name,
      passed: casePassed,
      deviceExecutions: finalRt.deviceExecutions.map((e) => ({
        device: deviceToString(e.device),
        state: e.state || "UNKNOWN",
        failedReason: e.failedReason,
        inconclusiveReason: e.inconclusiveReason,
        actionsJsonGcsUri: formatActionsGcsUri(finalRt.resultsBucket, name, e.device.model),
      })),
    });
  }

  const summary: TestResultSummary = {
    passed: totalFailures === 0,
    totalTestCases: summaryTestCases.length,
    passCount: totalPasses,
    failCount: totalFailures,
    testCases: summaryTestCases,
  };

  if (resultsFilePath) {
    try {
      fs.writeJsonSync(resultsFilePath, summary, { spaces: 2 });
      utils.logSuccess(`Wrote machine-readable test results to ${resultsFilePath}`);
    } catch (err: unknown) {
      logger.info(`Failed to write results file to ${resultsFilePath}: ${getErrMsg(err)}`);
    }
  }

  if (totalFailures > 0) {
    utils.logWarning(
      `\nAutomated test run finished with failures (${totalFailures} of ${summaryTestCases.length} test cases failed):`,
    );
    for (const tc of summaryTestCases) {
      if (!tc.passed) {
        utils.logWarning(`  - Case "${tc.displayName}":`);
        for (const exec of tc.deviceExecutions) {
          if (exec.state !== "PASSED") {
            const reason = exec.failedReason || exec.inconclusiveReason || exec.state;
            utils.logWarning(`    • ${exec.device}: ${reason}`);
            if (exec.actionsJsonGcsUri) {
              utils.logWarning(`      GCS actions log: ${exec.actionsJsonGcsUri}`);
            }
          }
        }
      }
    }
    throw new FirebaseError(
      `Automated test(s) failed: ${totalFailures} of ${summaryTestCases.length} test cases failed.`,
      { exit: 1 },
    );
  }

  utils.logSuccess(
    `Automated test(s) passed! (${totalPasses} of ${summaryTestCases.length} test cases passed)`,
  );
  return summary;
}

function formatActionsGcsUri(
  resultsBucket: string | undefined,
  releaseTestName: string | undefined,
  model: string,
): string | undefined {
  if (!resultsBucket || !releaseTestName) {
    return undefined;
  }
  const bucketName = resultsBucket.includes("buckets/")
    ? resultsBucket.split("buckets/")[1]
    : resultsBucket.replace(/^gs:\/\//, "");
  const testId = releaseTestName.split("/").pop() || "";
  return `gs://${bucketName}/${testId}/${model}/actions.json`;
}

function delay(ms: number): Promise<number> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deviceToString(device: TestDevice): string {
  return `${device.model} (${device.version}/${device.orientation}/${device.locale})`;
}
