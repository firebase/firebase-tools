import type { Options } from "@wdio/types";
import * as path from "path";

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: "./tsconfig.test.json",
      transpileOnly: true,
    },
  },

  specs: ["./integration/**/*.ts"],
  // Patterns to exclude.
  exclude: [
    // 'path/to/excluded/files'
  ],

  // Redirect noisy chromedriver and browser logs to ./logs
  outputDir: "./logs",

  capabilities: [
    {
      browserName: "vscode",
      browserVersion: "stable", // also possible: "insiders" or a specific version e.g. "1.80.0"
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

  services: ["vscode"],
  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
