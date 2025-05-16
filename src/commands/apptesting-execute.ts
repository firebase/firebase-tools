import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";
import * as clc from "colorette";
import { parseTestFiles } from "../apptesting/parseTestFiles";
import * as ora from "ora";

export const command = new Command("apptesting:execute <target>")
  .description(
    "upload a release binary and optionally distribute it to testers and run automated tests",
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
    const testDir = options.config.src.apptesting?.testDir || "tests";
    const tests = parseTestFiles(testDir, options.testFilePattern, options.testNamePattern);
    logger.info(clc.bold(`\n${clc.white("===")} Running ${tests.length} tests`));
    // logger.info(await marked("View progress and resuts in the [Firebase Console](https://console.firebase.google.com/project/fb-web-testing-agent-customer/apptesting/execution/7sdj3-asdf23-das23d-23da3radsf)"))

    const testResults: TestResults = Object.fromEntries(tests.map((t) => [t.id, "running"]));
    const spinner = ora(getOutput(testResults));
    await Promise.all(
      tests.map(async (test) => {
        spinner.start();
        await executeTest().then(() => {
          testResults[test.id] = "pass";
          spinner.text = getOutput(testResults);
        });
      }),
    );
    spinner.succeed();
  });

async function executeTest() {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.random() * 50000);
  });
}

type TestStatus = "running" | "pass" | "fail";
type TestResults = Record<string, TestStatus>;

function getOutput(testResults: TestResults) {
  const counts = { running: 0, pass: 0, fail: 0 };
  const failed = [];
  for (const [testId, status] of Object.entries(testResults)) {
    counts[status]++;
    failed.push(testId);
  }
  if (!counts.fail && !counts.running) {
    return "All tests passed";
  }
  return [
    counts.running ? `${counts.running} tests still running...` : undefined,
    counts.pass ? `✔ ${counts.pass} tests passing` : undefined,
    counts.fail ? `✖ ${counts.fail} tests failing` : undefined,
  ]
    .filter((a) => a)
    .join("\n");
}
