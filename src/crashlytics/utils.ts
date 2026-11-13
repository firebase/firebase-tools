import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { crashlyticsApiOrigin } from "../api";
import { AppPlatform, getAppPlatform } from "../management/apps";

export const TIMEOUT = 10000;

export const CRASHLYTICS_API_CLIENT = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export enum PLATFORM_PATH {
  ANDROID = "topAndroidDevices",
  IOS = "topAppleDevices",
}

/**
 * Extracts the project number from a Firebase App ID.
 */
export function parseProjectNumber(appId: string): string {
  const appIdParts = appId.split(":");
  if (appIdParts.length > 1) {
    return appIdParts[1];
  }
  throw new FirebaseError("Unable to get the projectId from the AppId.");
}

/**
 * Returns the AppPlatform encoded in a Firebase App ID (`1:<projectNumber>:<platform>:<hash>`),
 * or undefined if the App ID is missing or has no recognized platform segment.
 */
export function parseAppPlatform(appId?: string): AppPlatform | undefined {
  const platformSegment = appId?.split(":")[2];
  if (!platformSegment) {
    return undefined;
  }
  try {
    return getAppPlatform(platformSegment);
  } catch {
    return undefined;
  }
}

/**
 * Maps a mobile Firebase App ID to its platform-specific top devices report path.
 */
export function parsePlatform(appId: string): PLATFORM_PATH {
  const appIdParts = appId.split(":");
  if (appIdParts.length < 3) {
    throw new FirebaseError("Unable to get the platform from the AppId.");
  }

  if (appIdParts[2] === "android") {
    return PLATFORM_PATH.ANDROID;
  } else if (appIdParts[2] === "ios") {
    return PLATFORM_PATH.IOS;
  }
  throw new FirebaseError(`Only android or ios apps are supported.`);
}
