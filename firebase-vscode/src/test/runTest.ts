import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/src/core/index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Workaround for https://github.com/webdriverio-community/wdio-vscode-service/issues/101#issuecomment-1928159399
      version: "1.85.0",
    });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
