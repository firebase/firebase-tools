import { McpContext } from "../../types";
import { getPlatformsFromFolder, Platform, detectFiles } from "../../../appUtils";
import * as fs from "fs-extra";
import * as path from "path";
import { Client } from "../../../apiv2";

/**
 * Returns a function that detects whether Crashlytics is available.
 */
export async function isCrashlyticsAvailable(ctx: McpContext): Promise<boolean> {
  ctx.host.logger.debug("Looking for whether crashlytics is installed...");
  return await isCrashlyticsInstalled(ctx);
}

const CRASHLYTICS_GRADLE_PATTERN =
  /(firebase-crashlytics|firebase\.crashlytics|com\.google\.firebase\.crashlytics)/;

async function isCrashlyticsInstalled(ctx: McpContext): Promise<boolean> {
  const host = ctx.host;
  const projectDir =
    ctx.config.projectDir || host.cachedProjectDir || host.startupRoot || process.cwd();
  const platforms = await getPlatformsFromFolder(projectDir);

  // If this is not a supported platform, then Crashlytics will not be present
  if (
    !platforms.includes(Platform.FLUTTER) &&
    !platforms.includes(Platform.ANDROID) &&
    !platforms.includes(Platform.IOS) &&
    !platforms.includes(Platform.UNITY) &&
    !platforms.includes(Platform.WEB)
  ) {
    host.logger.debug("Found no supported Crashlytics platforms.");
    return false;
  }

  if (platforms.includes(Platform.FLUTTER) && (await flutterAppUsesCrashlytics(projectDir))) {
    host.logger.debug("Found Flutter app using Crashlytics");
    return true;
  }
  if (platforms.includes(Platform.UNITY) && (await unityAppUsesCrashlytics(projectDir))) {
    host.logger.debug("Found Unity app using Crashlytics");
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
  if (
    platforms.includes(Platform.WEB) &&
    (await webAppUsesCrashlytics(projectDir, ctx.projectId))
  ) {
    host.logger.debug("Found Web app using Crashlytics");
    return true;
  }

  host.logger.debug(
    `Found supported platforms ${JSON.stringify(platforms)}, but did not find a Crashlytics dependency.`,
  );
  return false;
}

async function androidAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const buildGradleFiles = await detectFiles(appPath, "build.gradle*");
  for (const file of buildGradleFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (CRASHLYTICS_GRADLE_PATTERN.test(content)) {
      return true;
    }
  }
  return false;
}

async function iosAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const filePatternsToDetect = ["Podfile", "Package.swift", "Cartfile*", "project.pbxproj"];
  const fileArrays = await Promise.all(
    filePatternsToDetect.map((term) => detectFiles(appPath, term)),
  );

  const files = fileArrays.flat();
  for (const file of files) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Crashlytics")) {
      return true;
    }
  }
  return false;
}

async function flutterAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const pubspecFiles = (
    await Promise.all([detectFiles(appPath, "pubspec.yaml"), detectFiles(appPath, "pubspec.lock")])
  ).flat();
  for (const file of pubspecFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("firebase_crashlytics")) {
      return true;
    }
  }
  return false;
}

async function unityAppUsesCrashlytics(appPath: string): Promise<boolean> {
  const upmFiles = (
    await Promise.all([
      detectFiles(appPath, "Packages/manifest.json"),
      detectFiles(appPath, "Packages/packages-lock.json"),
    ])
  ).flat();
  for (const file of upmFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("com.google.firebase.crashlytics")) {
      return true;
    }
  }

  const sdkFilePatterns = [
    "*CrashlyticsDependencies.xml",
    "GoogleDependency*Crashlytics*.xml",
    "Firebase.Crashlytics.dll",
    "com.google.firebase.crashlytics*.tgz",
  ];
  const sdkFiles = (
    await Promise.all(sdkFilePatterns.map((pattern) => detectFiles(appPath, pattern)))
  ).flat();
  if (sdkFiles.length > 0) {
    return true;
  }

  const gradleFiles = await detectFiles(appPath, "*.gradle");
  for (const file of gradleFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (CRASHLYTICS_GRADLE_PATTERN.test(content)) {
      return true;
    }
  }

  const csFiles = await detectFiles(appPath, "*.cs");
  for (const file of csFiles) {
    const content = await fs.readFile(path.join(appPath, file), "utf8");
    if (content.includes("Firebase.Crashlytics")) {
      return true;
    }
  }

  return false;
}

interface TelemetryConfig {
  name?: string;
  appId?: string;
  [key: string]: unknown;
}

interface ListConfigsResponse {
  configs?: TelemetryConfig[];
}

async function webAppUsesCrashlytics(appPath: string, projectId?: string): Promise<boolean> {
  if (!projectId) {
    return false;
  }

  const client = new Client({
    urlPrefix: "https://firebasetelemetryadmin.googleapis.com",
    auth: true,
    apiVersion: "v1alpha",
  });

  try {
    const res = await client.get<ListConfigsResponse>(
      `projects/${projectId}/locations/global/configs`,
    );
    const configs = res.body?.configs || [];
    const appIdsInPath = await getAppIdsFromAppPath(appPath);

    for (const config of configs) {
      if (config.appId && appIdsInPath.has(config.appId)) {
        return true;
      }
    }
  } catch {
    // Return false if the call to the Telemetry API fails
  }

  return false;
}

async function getAppIdsFromAppPath(appPath: string): Promise<Set<string>> {
  const appIds = new Set<string>();

  try {
    const files = await detectFiles(appPath, "*");
    const appIdRegex = /1:\d+:[a-z0-9_-]+:[a-z0-9_-]+/gi;

    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(appPath, file), "utf8");
        const matches = content.match(appIdRegex);
        if (matches) {
          for (const match of matches) {
            appIds.add(match);
          }
        }
      } catch {
        // Ignore unreadable files
      }
    }
  } catch {
    // Ignore glob detection errors
  }

  return appIds;
}
