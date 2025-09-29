import { input } from "../../../prompt";
import { Setup } from "../..";
import { FirebaseError } from "../../../error";
import {
  parseAppId,
  buildProvisionOptions,
  provisionAiLogicApp,
  getConfigFileName,
  validateProjectNumberMatch,
  validateAppExists,
} from "./utils";
import { getFirebaseProject } from "../../../management/projects";

export interface AiLogicInfo {
  appId: string;
}

/**
 * Ask questions for AI Logic setup via CLI
 */
export async function askQuestions(setup: Setup): Promise<void> {
  // Ask for Firebase app ID
  const appId = await input({
    message: "Enter your Firebase app ID (format: 1:PROJECT_NUMBER:PLATFORM:APP_ID):",
    validate: (input: string) => {
      if (!input) {
        return "Please enter a Firebase app ID";
      }

      // Validate app ID format using the same pattern as parseAppId
      const pattern =
        /^(?<version>\d+):(?<projectNumber>\d+):(?<platform>ios|android|web):([0-9a-fA-F]+)$/;
      if (!pattern.test(input)) {
        return "Invalid app ID format. Expected: 1:PROJECT_NUMBER:PLATFORM:APP_ID (e.g., 1:123456789:web:abcdef123456)";
      }

      return true;
    },
  });

  // Set up the feature info
  if (!setup.featureInfo) {
    setup.featureInfo = {};
  }

  setup.featureInfo.ailogic = {
    appId: appId,
  };
}

/**
 * AI Logic provisioning: validates existing app and project, enables AI Logic via API
 */
export async function actuate(setup: Setup): Promise<void> {
  const ailogicInfo = setup.featureInfo?.ailogic as AiLogicInfo;
  if (!ailogicInfo) {
    return;
  }

  try {
    const appInfo = parseAppId(ailogicInfo.appId);
    if (!setup.projectId) {
      throw new FirebaseError(
        "No project ID found. Please ensure you are in a Firebase project directory or specify a project.",
        { exit: 1 },
      );
    }
    const projectInfo = await getFirebaseProject(setup.projectId);
    validateProjectNumberMatch(appInfo, projectInfo);
    await validateAppExists(appInfo);

    const provisionOptions = buildProvisionOptions(
      setup.projectId,
      appInfo.platform,
      ailogicInfo.appId, // Use app ID directly as namespace
    );
    const response = await provisionAiLogicApp(provisionOptions);

    const configFileName = getConfigFileName(appInfo.platform);
    const configContent = Buffer.from(response.configData, "base64").toString("utf8");

    setup.instructions.push(
      `Firebase AI Logic has been enabled for existing ${appInfo.platform} app: ${ailogicInfo.appId}`,
      `Save the following content as ${configFileName} in your app's root directory:`,
      "",
      configContent,
      "",
      "Place this config file in the appropriate location for your platform.",
    );
  } catch (error) {
    throw new FirebaseError(
      `AI Logic setup failed: ${error instanceof Error ? error.message : String(error)}`,
      { original: error instanceof Error ? error : new Error(String(error)), exit: 2 },
    );
  }
}
