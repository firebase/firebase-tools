import * as fs from "fs-extra";
import { Config } from "../../../config";
import { Setup } from "../..";
import {
  SupportedPlatform,
  detectAppPlatform,
  buildProvisionOptions,
  provisionAiLogicApp,
  getConfigFilePath,
  writeAppConfigFile,
  extractProjectIdFromAppResource,
} from "./utils";

export interface AiLogicInfo {
  appPlatform?: "android" | "ios" | "web";
  appNamespace: string;
  overwriteConfig?: boolean;
}

/**
 * Ask questions for AI Logic setup via CLI
 */
export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  const { select } = await import("../../../prompt");
  const { input, confirm } = await import("../../../prompt");

  // Ask for app platform
  const platform = await select<"android" | "ios" | "web">({
    message: "Which platform would you like to set up?",
    choices: [
      { name: "Android", value: "android" },
      { name: "iOS", value: "ios" },
      { name: "Web", value: "web" },
    ],
  });

  // Ask for app namespace
  let appNamespace: string;
  if (platform === "android") {
    appNamespace = await input({
      message: "Enter your Android package name (e.g., com.example.myapp):",
      validate: (input: string) => {
        if (!input || !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(input)) {
          return "Please enter a valid Android package name (e.g., com.example.myapp)";
        }
        return true;
      },
    });
  } else if (platform === "ios") {
    appNamespace = await input({
      message: "Enter your iOS bundle ID (e.g., com.example.MyApp):",
      validate: (input: string) => {
        if (!input || !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(input)) {
          return "Please enter a valid iOS bundle ID (e.g., com.example.MyApp)";
        }
        return true;
      },
    });
  } else {
    appNamespace = await input({
      message: "Enter your web app name:",
      validate: (input: string) => {
        if (!input) {
          return "Please enter a web app name";
        }
        return true;
      },
    });
  }

  // Ask about overwriting existing config files
  const overwriteConfig = await confirm({
    message: "Would you like to overwrite existing config files if they exist?",
    default: false,
  });

  // Set up the feature info
  if (!setup.featureInfo) {
    setup.featureInfo = {};
  }

  setup.featureInfo.ailogic = {
    appPlatform: platform,
    appNamespace: appNamespace,
    overwriteConfig: overwriteConfig,
  };
}

/**
 * AI Logic provisioning: auto-detects/creates project and app, provisions via API
 */
export async function actuate(setup: Setup, config: Config): Promise<void> {
  const ailogicInfo = setup.featureInfo?.ailogic as AiLogicInfo;
  if (!ailogicInfo) {
    return;
  }

  try {
    // 1. Determine app platform
    const platform: SupportedPlatform =
      ailogicInfo.appPlatform || (await detectAppPlatform(config.projectDir));

    // 2. Check for config file conflicts
    const configFilePath = getConfigFilePath(config.projectDir, platform);
    if (fs.existsSync(configFilePath) && !ailogicInfo.overwriteConfig) {
      throw new Error(
        `Config file ${configFilePath} already exists. Use overwrite_config: true to update it.`,
      );
    }

    // 3. Build provisioning options
    const provisionOptions = buildProvisionOptions(
      setup.projectId,
      platform,
      ailogicInfo.appNamespace,
    );

    // 4. Provision Firebase app
    const response = await provisionAiLogicApp(provisionOptions);

    // 5. Extract project ID and update setup
    const projectId = extractProjectIdFromAppResource(response.appResource);
    setup.projectId = projectId;

    // 6. Write config file to current directory
    writeAppConfigFile(configFilePath, response.configData);

    // 7. Update .firebaserc if project was created
    if (setup.rcfile && setup.projectId) {
      if (!setup.rcfile.projects) {
        setup.rcfile.projects = {};
      }
      setup.rcfile.projects.default = setup.projectId;
    }

    // 8. Add instructions for user
    setup.instructions.push(
      `Firebase AI Logic has been enabled with a new ${platform} app.`,
      `Config file written to: ${configFilePath}`,
      "If you have multiple app directories, copy the config file to the appropriate app folder.",
      "Note: A new Firebase app was created. You can use existing Firebase apps with AI Logic (current API limitation).",
    );
  } catch (error) {
    throw new Error(
      `AI Logic setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
