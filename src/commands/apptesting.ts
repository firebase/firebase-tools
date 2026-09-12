import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { parseTestFiles, pluralizeTests } from "../apptesting/parseTestFiles";
import * as ora from "ora";
import { TestCaseInvocation } from "../apptesting/types";
import { FirebaseError, getError } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { awaitTestResults, Distribution, upload } from "../appdistribution/distribution";
import {
  AiInstructions,
  ReleaseTest,
  TestDevice,
  Release,
  LoginCredential,
} from "../appdistribution/types";
import {
  getAppName,
  parseTestDevices,
  getResultsBucket,
  getLoginCredential,
} from "../appdistribution/options-parser-util";
import * as utils from "../utils";
import { dirExistsSync } from "../fsutils";
import * as path from "path";

const defaultDevices = [
  {
    model: "MediumPhone.arm",
    version: "36",
    locale: "en_US",
    orientation: "portrait",
  },
];

export const command = new Command("apptesting:execute [release-binary-file]")
  .description("Run mobile automated tests written in natural language driven by AI")
  .option(
    "--app <app_id>",
    "The app id of your Firebase web app. Optional if the project contains exactly one web app.",
  )
  .option(
    "--test-file-pattern <pattern>",
    "Test file pattern. Only tests contained in files that match this pattern will be executed.",
  )
  .option(
    "--test-name-pattern <pattern>",
    "Test name pattern. Only tests with names that match this pattern will be executed.",
  )
  .option("--test-dir <test_dir>", "Directory where tests can be found. Defaults to './tests'.")
  .option(
    "--test-devices <string>",
    "Semicolon-separated list of devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .option(
    "--test-devices-file <string>",
    "Path to file containing a list of semicolon- or newline-separated devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .option(
    "--test-non-blocking",
    "Run automated tests without waiting for them to complete. Visit the Firebase console for the test results.",
  )
  .option(
    "--results-bucket <bucket>",
    "The name of a Google Cloud Storage bucket where raw test results will be stored. If this flag is not set, Firebase creates a default bucket for you. Note that the bucket must be owned by a billing-enabled project, and that using a non-default bucket will result in billing charges for the storage used.",
  )
  .option(
    "--results-file <results_file>",
    "Path to output a JSON file containing machine-readable test results.",
  )
  .option("--test-username <string>", "username for automatic login")
  .option(
    "--test-password <string>",
    "password for automatic login. If using a real password, use --test-password-file instead to avoid putting sensitive info in history and logs.",
  )
  .option("--test-password-file <string>", "path to file containing password for automatic login")
  .before(requireAuth)
  .action(async (target: string | undefined, options: any) => {
    const appName = getAppName(options);
    const resultsBucket = getResultsBucket(options.resultsBucket, appName);

    const testDir = path.resolve(options.testDir || "tests");
    if (!dirExistsSync(testDir)) {
      throw new FirebaseError(
        `Tests directory not found: ${testDir}. Use the --test-dir flag to choose a different directory.`,
      );
    }
    const tests = await parseTestFiles(
      testDir,
      undefined,
      options.testFilePattern,
      options.testNamePattern,
    );
    const testDevices = parseTestDevices(options.testDevices, options.testDevicesFile);
    const loginCredential = getLoginCredential({
      username: options.testUsername,
      password: options.testPassword,
      passwordFile: options.testPasswordFile,
    });

    if (!tests.length) {
      throw new FirebaseError(`No tests found under test directory ${testDir}`);
    }
    utils.logBullet(`Found ${pluralizeTests(tests.length)} to run under test directory ${testDir}`);

    const invokeSpinner = ora("Requesting test execution");
    const client = new AppDistributionClient();

    let releaseTests: ReleaseTest[];
    let release: Release;
    try {
      if (target) {
        release = await upload(client, appName, new Distribution(target));
      } else {
        utils.logBullet(
          "release-binary-file not provided, using the latest App Distribution release.",
        );
        const latestRelease = await client.getLatestRelease(appName);
        if (!latestRelease) {
          throw new FirebaseError(
            `No app binary found for ${appName}. Call apptesting:execute with a local app binary file, or upload a release to App Distribution.`,
          );
        }
        release = latestRelease;
        utils.logBullet(`Using release ${release.displayVersion} created at ${release.createTime}`);
      }

      invokeSpinner.start();
      releaseTests = await invokeTests(
        client,
        release.name,
        tests,
        !testDevices.length ? defaultDevices : testDevices,
        resultsBucket,
        loginCredential,
      );
      invokeSpinner.text = `${pluralizeTests(releaseTests.length)} started successfully!`;
      invokeSpinner.succeed();
    } catch (ex) {
      invokeSpinner.fail("Failed to request test execution");
      throw ex;
    }

    if (options.testNonBlocking) {
      utils.logBullet(
        `View progress and results in the Firebase Console:\n${release.firebaseConsoleUri}`,
      );
    } else {
      await awaitTestResults(releaseTests, client, options.resultsFile);
      utils.logBullet(
        `View detailed results in the Firebase Console:\n${release.firebaseConsoleUri}`,
      );
    }
  });

async function invokeTests(
  client: AppDistributionClient,
  releaseName: string,
  testDefs: TestCaseInvocation[],
  devices: TestDevice[],
  resultsBucket?: string,
  loginCredential?: LoginCredential,
): Promise<ReleaseTest[]> {
  try {
    const releaseTests: ReleaseTest[] = [];
    for (const testDef of testDefs) {
      const aiInstructions: AiInstructions = {
        steps: testDef.testCase.steps,
      };
      releaseTests.push(
        await client.createReleaseTest(releaseName, devices, {
          aiInstructions,
          displayName: testDef.testCase.displayName,
          resultsBucket,
          loginCredential,
        }),
      );
    }
    return releaseTests;
  } catch (err: unknown) {
    const errObj = getError(err);
    if (errObj instanceof FirebaseError) {
      throw errObj;
    }
    throw new FirebaseError(`Test invocation failed: ${errObj.message}`, { original: errObj });
  }
}
