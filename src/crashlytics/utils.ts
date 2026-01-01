import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { crashlyticsApiOrigin } from "../api";

export const TIMEOUT = 10000;

/**
 * Validates that the --app option is provided.
 * @param appId - The app ID from command options.
 * @returns The validated app ID.
 * @throws FirebaseError if the app ID is not provided.
 */
export function requireAppId(appId: string | undefined): string {
  if (!appId) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
  return appId;
}

export const CRASHLYTICS_API_CLIENT = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export enum PLATFORM_PATH {
  ANDROID = "topAndroidDevices",
  IOS = "topAppleDevices",
}

export function parseProjectNumber(appId: string): string {
  const appIdParts = appId.split(":");
  if (appIdParts.length > 1) {
    return appIdParts[1];
  }
  throw new FirebaseError("Unable to get the projectId from the AppId.");
}

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
