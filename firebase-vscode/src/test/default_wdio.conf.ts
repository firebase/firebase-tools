import * as path from "path";
import * as child_process from "child_process";
import { Notifications } from "./utils/page_objects/editor";
import type { Options } from "@wdio/types";

export const vscodeConfigs = {
  browserName: "vscode",
  browserVersion: "stable", // also possible: "insiders" or a specific version e.g. "1.80.0"
  "wdio:vscodeOptions": {
    vscodeArgs: {
      disableExtensions: false,
      installExtensions: ["graphql.vscode-graphql-syntax"],
    },
    // points to directory where extension package.json is located
    extensionPath: path.join(__dirname, "..", ".."),
    // optional VS Code settings
    userSettings: {
      "editor.fontSize": 14,
    },
  },
};

export const config: WebdriverIO.Config = {
  runner: "local",

  tsConfigPath: "./tsconfig.test.json",

  capabilities: [vscodeConfigs],

  // Redirect noisy chromedriver and browser logs to ./logs
  outputDir: "./logs",

  logLevel: "debug",

  beforeTest: async function () {
    const workbench = await browser.getWorkbench();

    const notifications = new Notifications(workbench);
    await notifications.installRecommendedExtension({
      extensionId: "graphql.vscode-graphql-syntax",
      message: "It is recommended to install GraphQL: Syntax Highlighter",
    });
  },

  afterTest: async function () {
    // Reset the test_projects directory to its original state after each test.
    // This ensures tests do not modify the test_projects directory.
    child_process.execSync(
      `git restore --source=HEAD -- ./src/test/test_projects`,
    );
  },

  services: ["vscode"],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
