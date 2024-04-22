import type { Options } from "@wdio/types";
import * as path from "path";
import * as child_process from "child_process";

export const vscodeConfigs = {
  browserName: "vscode",
  // Workaround for https://github.com/webdriverio-community/wdio-vscode-service/issues/101#issuecomment-1928159399
  browserVersion: "1.85.0", // also possible: "insiders" or a specific version e.g. "1.80.0"
  "wdio:vscodeOptions": {
    // points to directory where extension package.json is located
    extensionPath: path.join(__dirname, "..", ".."),
    // optional VS Code settings
    userSettings: {
      "editor.fontSize": 14,
    },
  },
};

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: "./tsconfig.test.json",
      transpileOnly: true,
    },
  },

  capabilities: [
    {
      browserName: "vscode",
      // Workaround for https://github.com/webdriverio-community/wdio-vscode-service/issues/101#issuecomment-1928159399
      browserVersion: "1.85.0", // also possible: "insiders" or a specific version e.g. "1.80.0"
      "wdio:vscodeOptions": {
        // points to directory where extension package.json is located
        extensionPath: path.join(__dirname, "..", ".."),
        // optional VS Code settings
        userSettings: {
          "editor.fontSize": 14,
        },
      },
    },
  ],

  // Redirect noisy chromedriver and browser logs to ./logs
  outputDir: "./logs",

  afterTest: async function () {
    // Reset the test_projects directory to its original state after each test.
    // This ensures tests do not modify the test_projects directory.
    child_process.execSync(
      `git restore --source=HEAD -- ./src/test/test_projects`
    );
  },

  services: ["vscode"],
  framework: "mocha",
  reporters: ["spec"],
};
