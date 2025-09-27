import { provisionFirebaseApp } from "../../../management/provisioning/provision";
import {
  ProvisionFirebaseAppOptions,
  ProvisionProjectOptions,
  ProvisionAppOptions,
  ProvisionFirebaseAppResponse,
} from "../../../management/provisioning/types";
import { AppPlatform, getAppConfig } from "../../../management/apps";
import { FirebaseError } from "../../../error";
import { FirebaseProjectMetadata } from "../../../types/project";

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
      throw new FirebaseError(`Unsupported platform: ${platform as string}`, { exit: 2 });
  }
}

export interface AppInfo {
  projectNumber: string;
  appId: string;
  platform: SupportedPlatform;
}

/**
 * Parses Firebase app ID using official pattern - based on MobilesdkAppId.java
 * Format: <version>:<projectNumber>:<platform>:<identifier>
 */
export function parseAppId(appId: string): AppInfo {
  const pattern =
    /^(?<version>\d+):(?<projectNumber>\d+):(?<platform>ios|android|web):([0-9a-fA-F]+)$/;
  const match = pattern.exec(appId);

  if (!match) {
    throw new FirebaseError(
      `Invalid app ID format: ${appId}. Expected format: 1:PROJECT_NUMBER:PLATFORM:IDENTIFIER`,
      { exit: 1 },
    );
  }

  return {
    projectNumber: match.groups?.projectNumber || "",
    appId: appId,
    platform: match.groups?.platform as SupportedPlatform,
  };
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
 * Step 2: Verify project number matches app ID's parsed project number
 */
export function validateProjectNumberMatch(
  appInfo: AppInfo,
  projectInfo: FirebaseProjectMetadata,
): void {
  if (projectInfo.projectNumber !== appInfo.projectNumber) {
    throw new FirebaseError(
      `App ${appInfo.appId} belongs to project number ${appInfo.projectNumber} but current project has number ${projectInfo.projectNumber}.`,
      { exit: 1 },
    );
  }
}

/**
 * Step 3: Validate that app exists
 */
export async function validateAppExists(appInfo: AppInfo): Promise<void> {
  try {
    // Convert to AppPlatform enum
    let appPlatform: AppPlatform;
    switch (appInfo.platform) {
      case "web":
        appPlatform = AppPlatform.WEB;
        break;
      case "ios":
        appPlatform = AppPlatform.IOS;
        break;
      case "android":
        appPlatform = AppPlatform.ANDROID;
        break;
    }

    await getAppConfig(appInfo.appId, appPlatform);
  } catch (error) {
    throw new FirebaseError(`App ${appInfo.appId} does not exist or is not accessible.`, {
      exit: 1,
      original: error instanceof Error ? error : new Error(String(error)),
    });
  }
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
