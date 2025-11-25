import { McpContext } from "../../types";
import { getPlatformsFromFolder, Platform, detectFiles } from "../../../appUtils";
import * as fs from "fs-extra";
import * as path from "path";

/**
 * Returns a function that detects whether Crashlytics is available.
 */
export async function isCrashlyticsAvailable(ctx: McpContext): Promise<boolean> {
  ctx.host.logger.debug("Looking for whether crashlytics is installed...");
  return await isCrashlyticsInstalled(ctx);
}

async function isCrashlyticsInstalled(ctx: McpContext): Promise<boolean> {
  const host = ctx.host;
  const projectDir = ctx.config.projectDir;
  const platforms = await getPlatformsFromFolder(projectDir);

  // If this is not a mobile app, then Crashlytics will not be present
  if (
    !platforms.includes(Platform.FLUTTER) &&
    !platforms.includes(Platform.ANDROID) &&
    !platforms.includes(Platform.IOS)
  ) {
    host.logger.debug("Found no supported Crashlytics platforms.");
    return false;
  }

  if (platforms.includes(Platform.FLUTTER) && (await flutterAppUsesCrashlytics(projectDir))) {
    host.logger.debug("Found Flutter app using Crashlytics");
    return true;
  }
  if (platforms.includes(Platform.ANDROID) && (await androidAppUsesCrashlytics(projectDir))) {
    host.logger.debug("Found Android app using Crashlytics");
    return true;
  }
  if (platforms.includes(Platform.IOS) && (await iosAppUsesCrashlytics(projectDir))) {
    host.logger.debug("Found iOS app using Crashlytics");
    return true;
  }

  host.logger.debug(
    `Found supported platforms ${JSON.stringify(platforms)}, but did not find a Crashlytics dependency.`,
  );
  return false;
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
    if (content.includes("Crashlytics")) {
      return true;
    }
  }
  const swiftPackageFiles = await detectFiles(appPath, "Package.swift");
  for (const file of swiftPackageFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Crashlytics")) {
      return true;
    }
  }
  const cartFiles = await detectFiles(appPath, "Cartfile*");
  for (const file of cartFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Crashlytics")) {
      return true;
    }
  }
  const xcodeProjectFiles = await detectFiles(appPath, "project.pbxproj");
  for (const file of xcodeProjectFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Crashlytics")) {
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
