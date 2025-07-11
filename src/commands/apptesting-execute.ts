import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";
import * as clc from "colorette";
import { parseTestFiles } from "../apptesting/parseTestFiles";
import * as ora from "ora";
import { invokeTests, pollInvocationStatus } from "../apptesting/invokeTests";
import { ExecutionMetadata } from "../apptesting/types";
import { FirebaseError } from "../error";
import { marked } from "marked";
import { needProjectId } from "../projectUtils";
import { consoleUrl } from "../utils";
import { AppPlatform, listFirebaseApps } from "../management/apps";

export const command = new Command("apptesting:execute <target>")
  .description("Run automated tests written in natural language driven by AI")
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
  .option("--tests-non-blocking", "Request test execution without waiting for them to complete.")
  .before(requireAuth)
  .before(requireConfig)
  .action(async (target: string, options: any) => {
    const projectId = needProjectId(options);
    const appList = await listFirebaseApps(projectId, AppPlatform.WEB);
    let app = appList.find((a) => a.appId === options.app);
    if (!app && appList.length === 1) {
      app = appList[0];
      logger.info(`No app specified, defaulting to ${app.appId}`);
    } else if (!app) {
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

    const invokeSpinner = ora("Requesting test execution");
    invokeSpinner.start();

    let invocationOperation;
    try {
      invocationOperation = await invokeTests(app.appId, target, tests);
      invokeSpinner.text = "Test execution requested";
      invokeSpinner.succeed();
    } catch (ex) {
      invokeSpinner.fail("Failed to request test execution");
      throw ex;
    }

    logger.info(clc.bold(`\n${clc.white("===")} Running ${pluralizeTests(tests.length)}`));

    const invocationId = invocationOperation.name?.split("/").pop();

    // The console expects legacy namespace style IDs.
    // This is temporary until console supports appId URLs.
    const appWebId = (app as any).webId;
    const url = consoleUrl(
      projectId,
      `/apptesting/app/web:${appWebId}/invocations/${invocationId}`,
    );
    logger.info(await marked(`**Invocation ID:** ${invocationId}`));
    logger.info(await marked(`View progress and results in the [Firebase Console](${url})`));

    if (options.testsNonBlocking) {
      logger.info("Not waiting for results");
      return;
    }

    if (!invocationOperation.metadata) {
      throw new FirebaseError("Invocation details unavailable");
    }

    const executionSpinner = ora(getOutput(invocationOperation.metadata));
    executionSpinner.start();
    const invocationOp = await pollInvocationStatus(invocationOperation.name, (operation) => {
      if (!operation.done) {
        executionSpinner.text = getOutput(operation.metadata as ExecutionMetadata);
      }
    });
    const response = invocationOp.resource.testInvocation;
    executionSpinner.text = `Testing complete\n${getOutput(response)}`;
    if (response.failedExecutions || response.cancelledExecutions) {
      executionSpinner.fail();
      throw new FirebaseError("Testing complete with errors");
    } else {
      executionSpinner.succeed();
    }
  });

function pluralizeTests(numTests: number) {
  return `${numTests} test${numTests === 1 ? "" : "s"}`;
}

function getOutput(invocation: ExecutionMetadata) {
  const output = [];
  if (invocation.runningExecutions) {
    output.push(
      `${pluralizeTests(invocation.runningExecutions)} running (this may take a while)...`,
    );
  }
  if (invocation.succeededExecutions) {
    output.push(`✔ ${pluralizeTests(invocation.succeededExecutions)} passed`);
  }
  if (invocation.failedExecutions) {
    output.push(`✖ ${pluralizeTests(invocation.failedExecutions)} failed`);
  }
  if (invocation.cancelledExecutions) {
    output.push(`⊝ ${pluralizeTests(invocation.cancelledExecutions)} cancelled`);
  }
  return output.length ? output.join("\n") : "Tests are starting";
}
