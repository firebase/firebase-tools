import { AppPlatform, listFirebaseApps, AppMetadata } from "../../../management/apps";
import { FirebaseError } from "../../../error";
import { FirebaseProjectMetadata } from "../../../types/project";

/**
 * Returns the Firebase configuration filename for a given platform
 */
export function getConfigFileName(platform: AppPlatform): string {
  switch (platform) {
    case AppPlatform.IOS:
      return "GoogleService-Info.plist";
    case AppPlatform.ANDROID:
      return "google-services.json";
    case AppPlatform.WEB:
      return "firebase-config.json";
    default:
      throw new FirebaseError(`Unsupported platform: ${platform as string}`, { exit: 2 });
  }
}

export interface AppInfo {
  projectNumber: string;
  appId: string;
  platform: AppPlatform;
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

  const platformString = match.groups?.platform || "";
  let platform: AppPlatform;
  switch (platformString) {
    case "ios":
      platform = AppPlatform.IOS;
      break;
    case "android":
      platform = AppPlatform.ANDROID;
      break;
    case "web":
      platform = AppPlatform.WEB;
      break;
    default:
      throw new FirebaseError(`Unsupported platform: ${platformString}`, { exit: 1 });
  }

  return {
    projectNumber: match.groups?.projectNumber || "",
    appId: appId,
    platform,
  };
}

/**
 * Verify project number matches app ID's parsed project number
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
 * Validate that app exists
 */
export async function validateAppExists(appInfo: AppInfo, projectId: string): Promise<AppMetadata> {
  try {
    // Get apps list to find the specific app with metadata
    const apps = await listFirebaseApps(projectId, appInfo.platform);
    const app = apps.find((a) => a.appId === appInfo.appId);

    if (!app) {
      throw new FirebaseError(`App ${appInfo.appId} does not exist in project ${projectId}.`, {
        exit: 1,
      });
    }

    return app;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw error;
    }
    throw new FirebaseError(`App ${appInfo.appId} does not exist or is not accessible.`, {
      exit: 1,
      original: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
