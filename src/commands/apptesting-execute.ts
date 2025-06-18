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
      throw new FirebaseError("App is required")
    }
    const testDir = options.config.src.apptesting?.testDir || "tests";
    const tests = parseTestFiles(testDir, options.testFilePattern, options.testNamePattern);

    if (!tests.length) {
      throw new FirebaseError("No tests found");
    }

    logger.info(clc.bold(`\n${clc.white("===")} Running ${tests.length} tests`));

    const invocationOperation = await invokeTests(options.app, target, tests);
    const invocationId = invocationOperation.metadata?.name?.split("/").pop();
    const projectId = needProjectId(options);
    const url = consoleUrl(projectId, `apptesting/${options.app}/invocation/${invocationId}`);
    logger.info(await marked(`View progress and resuts in the [Firebase Console](${url})`));

    if (options.testsNonBlocking) {
      logger.info("Not waiting for results");
      return;
    }

    if (!invocationOperation.metadata) {
      throw new FirebaseError("Invocation details unavailable");
    }

    const spinner = ora(getOutput(invocationOperation.metadata));
    spinner.start();
    await pollInvocationStatus(invocationOperation.name, (operation) => {
      if (!operation.response) {
        logger.info("invocation details unavailable");
        return;
      }
      spinner.text = getOutput(operation.metadata as TestInvocation);
    });
    spinner.succeed();
  });

function getOutput(invocation: TestInvocation) {
  if (!invocation.failedExecutions && !invocation.runningExecutions) {
    return "All tests passed";
  }
  return [
    invocation.runningExecutions
      ? `${invocation.runningExecutions} tests still running...`
      : undefined,
    invocation.succeededExecutions
      ? `✔ ${invocation.succeededExecutions} tests passing`
      : undefined,
    invocation.failedExecutions ? `✖ ${invocation.failedExecutions} tests failing` : undefined,
  ]
    .filter((a) => a)
    .join("\n");
}
