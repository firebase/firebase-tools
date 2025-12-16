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
import { AIInstruction, ReleaseTest } from "../appdistribution/types";
import { getAppName } from "../appdistribution/options-parser-util";

// TODO rothbutter add ability to specify devices
const defaultDevices = [
  {
    model: "MediumPhone.arm",
    version: "30",
    locale: "en_US",
    orientation: "portrait",
  },
];

export const command = new Command("apptesting:mobile-execute <target>")
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
      testInvocations = await invokeMataTests(client, releaseId, tests);
      invokeSpinner.text = "Test execution requested";
      invokeSpinner.succeed();
    } catch (ex) {
      invokeSpinner.fail("Failed to request test execution");
      throw ex;
    }

    logger.info(
      clc.bold(`\n${clc.white("===")} Running ${pluralizeTests(testInvocations.length)}`),
    );
    logger.info(await marked(`View progress and results in the [Firebase Console]`));
  });

function pluralizeTests(numTests: number) {
  return `${numTests} test${numTests === 1 ? "" : "s"}`;
}

async function invokeMataTests(
  client: AppDistributionClient,
  releaseName: string,
  testDefs: TestCaseInvocation[],
) {
  try {
    const testInvocations: ReleaseTest[] = [];
    for (const testDef of testDefs) {
      const aiInstruction: AIInstruction = {
        steps: testDef.testCase.instructions.steps,
      };
      testInvocations.push(
        await client.createReleaseTest(releaseName, defaultDevices, aiInstruction),
      );
    }
    return testInvocations;
  } catch (err: unknown) {
    throw new FirebaseError("Test invocation failed", { original: getError(err) });
  }
}
