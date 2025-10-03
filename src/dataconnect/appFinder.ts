import * as path from "path";
import { Framework, Platform } from "./types";
import {
  detectApps as appUtilsDetectApps,
  getPlatformsFromFolder,
  Platform as AppUtilsPlatform,
  Framework as AppUtilsFramework,
  App as AppUtilsApp,
} from "../appUtils";

export interface App {
  platform: Platform;
  directory: string;
  frameworks?: Framework[];
}

/** Returns a string description of the app */
export function appDescription(a: App): string {
  return `${a.directory} (${a.platform.toLowerCase()})`;
}

/** Given a directory, determine the platform type */
export async function getPlatformFromFolder(dirPath: string): Promise<Platform> {
  const platforms = await getPlatformsFromFolder(dirPath);

  if (platforms.length === 0) {
    return Platform.NONE;
  }

  // Its not clear which platform the app directory is
  // because we found indicators for multiple platforms.
  if (platforms.length > 1) {
    return Platform.MULTIPLE;
  }

  return toDataConnectPlatform(platforms[0]);
}

/** Detects the apps in a given directory */
export async function detectApps(dirPath: string): Promise<App[]> {
  return appUtilsDetectApps(dirPath).then((apps) => apps.map(toDataConnectApp));
}

export function isPathInside(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);
  return !relativePath.startsWith(`..`);
}

function toDataConnectPlatform(platform: AppUtilsPlatform): Platform {
  switch (platform) {
    case AppUtilsPlatform.IOS:
      return Platform.IOS;
    case AppUtilsPlatform.ANDROID:
      return Platform.ANDROID;
    case AppUtilsPlatform.FLUTTER:
      return Platform.FLUTTER;
    case AppUtilsPlatform.WEB:
      return Platform.WEB;
  }
}

function toDataConnectFramework(framework: AppUtilsFramework): Framework {
  switch (framework) {
    case AppUtilsFramework.ANGULAR:
      return "angular";
    case AppUtilsFramework.REACT:
      return "react";
  }
}

function toDataConnectApp(app: AppUtilsApp): App {
  const output: App = {
    platform: toDataConnectPlatform(app.platform),
    directory: app.directory,
  };

  if (app.frameworks) {
    output.frameworks = app.frameworks.map((framework) => toDataConnectFramework(framework));
  }
  return output;
}
