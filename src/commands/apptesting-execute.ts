import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";
import * as clc from "colorette";
import { parseTestFiles } from "../apptesting/parseTestFiles";
import * as ora from "ora";
import { invokeTests, pollInvocationStatus } from "../apptesting/invokeTests";
import { TestInvocation } from "../apptesting/types";
import { FirebaseError } from "../error";
import { marked } from "marked";
import { needProjectId } from "../projectUtils";
import { consoleUrl } from "../utils";
import { AppPlatform, listFirebaseApps } from "../management/apps";

export const command = new Command("apptesting:execute <target>")
  .description(
    "upload a release binary and optionally distribute it to testers and run automated tests",
  )
  .option("--app <app_id>", "the app id of your Firebase app")
  .option(
    "--test-file-pattern <pattern>",
    "Test file pattern. Only tests contained in files that match this pattern will be executed.",
  )
  .option(
    "--test-name-pattern <pattern>",
    "Test name pattern. Only tests with names that match this pattern will be executed.",
  )
  .option("--tests-non-blocking", "Request test execution without waiting for them to complete.")
  .before(requireAuth)
  .before(requireConfig)
  .action(async (target: string, options: any) => {
    if (!options.app) {
      throw new FirebaseError("App is required");
    }

    const projectId = needProjectId(options);
    const appList = await listFirebaseApps(projectId, AppPlatform.WEB);
    const app = appList.find((a) => a.appId === options.app);

    if (!app) {
      throw new FirebaseError("Invalid app id");
    }

    const testDir = options.config.src.apptesting?.testDir || "tests";
    const tests = await parseTestFiles(
      testDir,
      target,
      options.testFilePattern,
      options.testNamePattern,
    );

    if (!tests.length) {
      throw new FirebaseError("No tests found");
    }

    logger.info(clc.bold(`\n${clc.white("===")} Running ${tests.length} tests`));

    const invokeSpinner = ora("Sending test request");
    invokeSpinner.start();
    const invocationOperation = await invokeTests(options.app, target, tests);
    invokeSpinner.text = "Testing started";
    invokeSpinner.succeed();

    const invocationId = invocationOperation.name?.split("/").pop();

    // The console expects legacy namespace style IDs.
    // This is temporary until console supports appId URLs.
    const appWebId = (app as any).webId;
    const url = consoleUrl(
      projectId,
      `/apptesting/app/web:${appWebId}/invocations/${invocationId}`,
    );
    logger.info(await marked(`View progress and resuts in the [Firebase Console](${url})`));

    if (options.testsNonBlocking) {
      logger.info("Not waiting for results");
      return;
    }

    if (!invocationOperation.metadata) {
      throw new FirebaseError("Invocation details unavailable");
    }

    const executionSpinner = ora(getOutput(invocationOperation.metadata));
    executionSpinner.start();
    await pollInvocationStatus(invocationOperation.name, (operation) => {
      if (!operation.response) {
        logger.info("invocation details unavailable");
        return;
      }
      executionSpinner.text = getOutput(operation.metadata as TestInvocation);
    });
    executionSpinner.succeed();
  });

function getOutput(invocation: TestInvocation) {
  if (!invocation.failedExecutions && !invocation.runningExecutions) {
    return "All tests passed";
  }
  return [
    invocation.runningExecutions
      ? `${invocation.runningExecutions} tests still running (this may take a while)...`
      : undefined,
    invocation.succeededExecutions
      ? `✔ ${invocation.succeededExecutions} tests passing`
      : undefined,
    invocation.failedExecutions ? `✖ ${invocation.failedExecutions} tests failing` : undefined,
  ]
    .filter((a) => a)
    .join("\n");
}
