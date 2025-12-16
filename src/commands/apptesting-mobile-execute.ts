import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";
import * as clc from "colorette";
import { parseTestFiles } from "../apptesting/parseTestFiles";
import * as ora from "ora";
import { TestCaseInvocation } from "../apptesting/types";
import { FirebaseError, getError } from "../error";
import { marked } from "marked";
import { needProjectId } from "../projectUtils";
import { consoleUrl } from "../utils";
import { AppPlatform, listFirebaseApps, checkForApps } from "../management/apps";
import { AppDistributionClient } from "../appdistribution/client";
import { Distribution, upload } from "../appdistribution/distribution";
import { AIInstruction, ReleaseTest } from "../appdistribution/types";

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
    const projectId = needProjectId(options);

    // TODO(rothbutter) probably want to call the paginated API and run this in a loop to handle the case where a customer has more than 100 apps
    const apps = await listFirebaseApps(projectId, AppPlatform.ANDROID);

    // Fail out early if there's no apps.
    checkForApps(apps, AppPlatform.ANDROID);

    let app = apps.find((a) => a.appId === options.app);
    if (!app) {
      if (options.app) {
        // TODO(rothbutter) why not just look up the app directly by ID?
        // An app ID was provided, but it's invalid.
        throw new FirebaseError(
          `App with ID '${options.app}' was not found in project ${projectId}. You can list available apps with 'firebase apps:list'.`,
        );
      }
      // if there's only one app, we don't need to prompt interactively
      if (apps.length === 1) {
        // If there's only one, use it.
        app = apps[0];
      } else {
        // If there's > 1, fail
        throw new FirebaseError(
          `Project ${projectId} has multiple apps, must specify a web app id with '--app', you can list available apps with 'firebase apps:list'.`,
        );
      }
    }

    logger.info(`Resolved app: ${app.appId} and the platform is ${app.platform}.`);

    const testDir = options.testDir || "tests";
    logger.info(`Resolved test dir is ${testDir}.`);

    const tests = await parseTestFiles(
      testDir,
      undefined,
      options.testFilePattern,
      options.testNamePattern,
    );

    if (!tests.length) {
      throw new FirebaseError("No tests found");
    }

    // const invokeSpinner = ora("Requesting test execution");
    // invokeSpinner.start();

    let testInvocations;
    let releaseId;
    try {
      const client = new AppDistributionClient();
      releaseId = await upload(client, app.appId, new Distribution(target));
      testInvocations = await invokeMataTests(client, releaseId, tests);
      // invokeSpinner.text = "Test execution requested";
      // invokeSpinner.succeed();
    } catch (ex) {
      // invokeSpinner.fail("Failed to request test execution");
      throw ex;
    }

    logger.info(clc.bold(`\n${clc.white("===")} Running ${pluralizeTests(testInvocations.length)}`));

    // The console expects legacy namespace style IDs.
    // This is temporary until console supports appId URLs.
    const appWebId = (app as any).webId;
    const url = `TODO: Need package name for this.`;
    logger.info(await marked(`View progress and results in the [Firebase Console](${url})`));
  });

function pluralizeTests(numTests: number) {
  return `${numTests} test${numTests === 1 ? "" : "s"}`;
}

async function invokeMataTests(client: AppDistributionClient, releaseName: string, testDefs: TestCaseInvocation[]) {
  logger.info(`About to execute dope tests!!!`);
  try {
    let testInvocations: ReleaseTest[] = [];
    for (const testDef of testDefs) {
      let aiInstruction: AIInstruction = {
        steps: testDef.testCase.instructions.steps
      };
      testInvocations.push(await client.createReleaseTest(releaseName, defaultDevices, aiInstruction));
    }
    return testInvocations;
  } catch (err: unknown) {
    throw new FirebaseError("Test invocation failed", { original: getError(err) });
  }
}