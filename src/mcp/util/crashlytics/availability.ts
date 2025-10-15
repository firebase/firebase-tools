import { McpContext } from "../../types";
import { getPlatformsFromFolder, Platform, detectFiles } from "../../../appUtils";
import * as fs from "fs-extra";
import * as path from "path";

/**
 * Returns a function that detects whether Crashlytics is available.
 */
export async function isCrashlyticsAvailable(ctx: McpContext): Promise<boolean> {
  return await isCrashlyticsInstalled(ctx.config.projectDir);
}

async function isCrashlyticsInstalled(projectDir: string): Promise<boolean> {
  const platforms = await getPlatformsFromFolder(projectDir);

  // If this is not a mobile app, then Crashlytics will not be present
  if (
    !platforms.includes(Platform.FLUTTER) &&
    !platforms.includes(Platform.ANDROID) &&
    !platforms.includes(Platform.IOS)
  ) {
    return false;
  }

  let usesCrashlytics = false;
  if (platforms.includes(Platform.FLUTTER)) {
    usesCrashlytics = usesCrashlytics || (await flutterAppUsesCrashlytics(projectDir));
  }
  if (platforms.includes(Platform.ANDROID)) {
    usesCrashlytics = usesCrashlytics || (await androidAppUsesCrashlytics(projectDir));
  }
  if (platforms.includes(Platform.IOS)) {
    usesCrashlytics = usesCrashlytics || (await iosAppUsesCrashlytics(projectDir));
  }
  return usesCrashlytics;
}

async function androidAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const buildGradleFiles = await detectFiles(appPath, "build.gradle*");
  const crashlyticsPattern =
    /(firebase-crashlytics|firebase\.crashlytics|com\.google\.firebase\.crashlytics)/;
  for (const file of buildGradleFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (crashlyticsPattern.test(content)) {
      return true;
    }
  }
  return false;
}

async function iosAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const podfiles = await detectFiles(appPath, "Podfile");
  for (const file of podfiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Firebase/Crashlytics")) {
      return true;
    }
  }
  const swiftPackageFiles = await detectFiles(appPath, "Package.swift");
  for (const file of swiftPackageFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("FirebaseCrashlytics")) {
      return true;
    }
  }
  return false;
}

async function flutterAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const pubspecFiles = await detectFiles(appPath, "pubspec.yaml");
  for (const file of pubspecFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("firebase_crashlytics")) {
      return true;
    }
  }
  return false;
}
