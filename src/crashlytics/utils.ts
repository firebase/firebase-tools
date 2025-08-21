import { FirebaseError } from "../error";

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
