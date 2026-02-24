import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { logger } from "../logger";
import * as clc from "colorette";
import { parseTestFiles } from "../apptesting/parseTestFiles";
import * as ora from "ora";
import { TestCaseInvocation } from "../apptesting/types";
import { FirebaseError, getError } from "../error";
import { marked } from "marked";
import { AppDistributionClient } from "../appdistribution/client";
import { Distribution, upload } from "../appdistribution/distribution";
import { AIInstruction, ReleaseTest, TestDevice } from "../appdistribution/types";
import { getAppName, parseTestDevices } from "../appdistribution/options-parser-util";

const defaultDevices = [
  {
    model: "MediumPhone.arm",
    version: "36",
    locale: "en_US",
    orientation: "portrait",
  },
];

export const command = new Command("apptesting:execute <release-binary-file>")
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
  .option("--test-dir <test_dir>", "Directory where tests can be found.")
  .option(
    "--test-devices <string>",
    "semicolon-separated list of devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .option(
    "--test-devices-file <string>",
    "path to file containing a list of semicolon- or newline-separated devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .before(requireAuth)
  .action(async (target: string, options: any) => {
    const appName = getAppName(options);

    const testDir = options.testDir || "tests";
    const tests = await parseTestFiles(
      testDir,
      undefined,
      options.testFilePattern,
      options.testNamePattern,
    );
    const testDevices = parseTestDevices(options.testDevices, options.testDevicesFile);

    if (!tests.length) {
      throw new FirebaseError("No tests found");
    }

    const invokeSpinner = ora("Requesting test execution");

    let testInvocations;
    let releaseId;
    try {
      const client = new AppDistributionClient();
      releaseId = await upload(client, appName, new Distribution(target));

      invokeSpinner.start();
      testInvocations = await invokeTests(
        client,
        releaseId,
        tests,
        !testDevices.length ? defaultDevices : testDevices,
      );
      invokeSpinner.text = "Test execution requested";
      invokeSpinner.succeed();
    } catch (ex) {
      invokeSpinner.fail("Failed to request test execution");
      throw ex;
    }

    logger.info(
      clc.bold(`\n${clc.white("===")} Running ${pluralizeTests(testInvocations.length)}`),
    );
    logger.info(await marked(`View progress and results in the Firebase Console`));
  });

function pluralizeTests(numTests: number) {
  return `${numTests} test${numTests === 1 ? "" : "s"}`;
}

async function invokeTests(
  client: AppDistributionClient,
  releaseName: string,
  testDefs: TestCaseInvocation[],
  devices: TestDevice[],
) {
  try {
    const testInvocations: ReleaseTest[] = [];
    for (const testDef of testDefs) {
      const aiInstruction: AIInstruction = {
        steps: testDef.testCase.steps,
      };
      testInvocations.push(
        await client.createReleaseTest(
          releaseName,
          devices,
          aiInstruction,
          undefined,
          undefined,
          testDef.testCase.displayName,
        ),
      );
    }
    return testInvocations;
  } catch (err: unknown) {
    throw new FirebaseError("Test invocation failed", { original: getError(err) });
  }
}
