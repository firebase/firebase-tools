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
 * Questions are handled by the MCP schema.
 */
export async function askQuestions(): Promise<void> {
  // No-op for MCP - questions handled by schema
  // TODO: Implement CLI prompts for future
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
