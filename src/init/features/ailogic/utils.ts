import * as path from "path";
import * as fs from "fs-extra";
// TODO(caot): refactor appFinder to a common util later
import { getPlatformFromFolder } from "../../../dataconnect/appFinder";
import { Platform } from "../../../dataconnect/types";
import { provisionFirebaseApp } from "../../../management/provisioning/provision";
import {
  ProvisionFirebaseAppOptions,
  ProvisionProjectOptions,
  ProvisionAppOptions,
  ProvisionFirebaseAppResponse,
} from "../../../management/provisioning/types";
import { AppPlatform } from "../../../management/apps";
import { FirebaseError } from "../../../error";

export type SupportedPlatform = "ios" | "android" | "web";

/**
 * Returns the Firebase configuration filename for a given platform
 */
export function getConfigFileName(platform: SupportedPlatform): string {
  switch (platform) {
    case "ios":
      return "GoogleService-Info.plist";
    case "android":
      return "google-services.json";
    case "web":
      return "firebase-config.json";
    default:
      throw new Error(`Unsupported platform: ${platform as string}`);
  }
}

/**
 * Returns the full file path for Firebase configuration file in the given app directory
 */
export function getConfigFilePath(appDirectory: string, platform: SupportedPlatform): string {
  const filename = getConfigFileName(platform);
  return path.join(appDirectory, filename);
}

/**
 * Writes config file from base64 data with proper decoding
 */
export function writeAppConfigFile(filePath: string, base64Data: string): void {
  try {
    const configContent = Buffer.from(base64Data, "base64").toString("utf8");
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, configContent, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to write config file to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extracts project ID from app resource name
 */
export function extractProjectIdFromAppResource(appResource: string): string {
  const match = /^projects\/([^/]+)/.exec(appResource);
  if (!match) {
    throw new Error(`Invalid app resource format: ${appResource}`);
  }
  return match[1];
}

/**
 * Detects app platform using AppFinder with AI Logic specific logic
 */
export async function detectAppPlatform(projectDir: string): Promise<SupportedPlatform> {
  const detectedPlatform = await getPlatformFromFolder(projectDir);

  switch (detectedPlatform) {
    case Platform.WEB:
      return "web";
    case Platform.ANDROID:
      return "android";
    case Platform.IOS:
      return "ios";
    case Platform.NONE:
      throw new Error(
        "No app platform detected in current directory. Please specify app_platform (android, ios, or web) " +
          "or create an app first (e.g., 'npx create-react-app my-app', 'flutter create my-app').",
      );
    case Platform.MULTIPLE:
      throw new Error(
        "Multiple app platforms detected in current directory. Please specify app_platform (android, ios, or web) " +
          "to clarify which platform to use for Firebase app creation.",
      );
    default:
      throw new Error(
        `Unsupported platform detected: ${detectedPlatform}. Please specify app_platform (android, ios, or web).`,
      );
  }
}

/**
 * Builds provisioning options for AI Logic from feature inputs
 */
export function buildProvisionOptions(
  projectId: string | undefined,
  platform: SupportedPlatform,
  appNamespace: string,
): ProvisionFirebaseAppOptions {
  // Build project options
  const projectOptions: ProvisionProjectOptions = {
    displayName: "Firebase Project", // Default name
  };

  // If there's an active project, use it; otherwise create new
  if (projectId) {
    projectOptions.parent = { type: "existing_project", projectId };
  }

  // Build app options based on platform
  let appOptions: ProvisionAppOptions;
  switch (platform) {
    case "android":
      appOptions = {
        platform: AppPlatform.ANDROID,
        packageName: appNamespace,
      };
      break;
    case "ios":
      appOptions = {
        platform: AppPlatform.IOS,
        bundleId: appNamespace,
      };
      break;
    case "web":
      appOptions = {
        platform: AppPlatform.WEB,
        webAppId: appNamespace,
      };
      break;
  }

  return {
    project: projectOptions,
    app: appOptions,
    features: {
      firebaseAiLogicInput: {}, // Enable AI Logic
    },
  };
}

/**
 * Provisions Firebase app using the provisioning API
 */
export async function provisionAiLogicApp(
  provisionOptions: ProvisionFirebaseAppOptions,
): Promise<ProvisionFirebaseAppResponse> {
  try {
    const response = await provisionFirebaseApp(provisionOptions);
    return response;
  } catch (error) {
    throw new FirebaseError(
      `AI Logic provisioning failed: ${error instanceof Error ? error.message : String(error)}`,
      { original: error instanceof Error ? error : new Error(String(error)), exit: 2 },
    );
  }
}

