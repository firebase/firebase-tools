import * as path from "path";
import * as fs from "fs";

import * as child_process from "child_process";
import { Notifications } from "./utils/page_objects/editor";

process.env.VSCODE_TEST_MODE = "true";
// used to preload extension dependencies
const prebuiltExtensionsDir = path.resolve(__dirname, "../../prebuilt-extensions");
export const vscodeConfigs = {
  browserName: "vscode",
  browserVersion: "1.96.4", // also possible: "insiders" or a specific version e.g. "1.80.0"
  "wdio:vscodeOptions": {
    vscodeArgs: {
      disableExtensions: false,
      extensionsDir: prebuiltExtensionsDir,
    },
    // points to directory where extension package.json is located
    extensionPath: path.join(__dirname, "..", ".."),
    // optional VS Code settings
    userSettings: {
      "editor.fontSize": 14,
    },
    vscodeProxyOptions: {
      commandTimeout: 60000,
    },
  },
};

export const config: WebdriverIO.Config = {
  runner: "local",
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./tsconfig.test.json",
    },
  },
  capabilities: [vscodeConfigs],

  // Redirect noisy chromedriver and browser logs to ./logs
  outputDir: "./logs",

  logLevel: "debug",

  beforeTest: async function () {    
    await browser.pause(3000); // give some time for extension dependencies to load their README page
    await browser.executeWorkbench((vscode) => {
      vscode.commands.executeCommand("workbench.action.closeAllEditors"); // close GCA home page
    });
  },

  afterTest: async function (test) {
    // Reset the test_projects directory to its original state after each test.
    // This ensures tests do not modify the test_projects directory.
    child_process.execSync(
      `git restore --source=HEAD -- ./src/test/test_projects`,
    );
    // Only take a screenshot if the test failed
    if (test.error !== undefined) {
      const screenshotDir = path.join(__dirname, "screenshots");
      fs.mkdirSync(screenshotDir, { recursive: true });
      await browser.saveScreenshot(
        path.join(screenshotDir, `${test.parent} - ${test.title}.png`),
      );
    }
  },

  services: ["vscode"],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "tdd",
    timeout: 120000,
  },
};
