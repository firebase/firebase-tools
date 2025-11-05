import * as fs from "fs-extra";
import * as path from "path";
import { glob } from "glob";
import { PackageJSON } from "./frameworks/compose/discover/runtime/node";

/**
 * Supported application platforms.
 */
export enum Platform {
  ANDROID = "ANDROID",
  WEB = "WEB",
  IOS = "IOS",
  FLUTTER = "FLUTTER",
  ADMIN_NODE = "ADMIN_NODE",
}

/**
 * Supported web frameworks.
 */
export enum Framework {
  REACT = "react",
  ANGULAR = "angular",
}

interface AppIdentifier {
  appId: string;
  bundleId?: string;
}

/**
 * Represents a detected application.
 */
export interface App {
  platform: Platform;
  directory: string;
  appId?: string;
  bundleId?: string;
  frameworks?: Framework[];
}

/** Returns a string description of the app */
export function appDescription(a: App): string {
  return `${a.directory} (${a.platform.toLowerCase()})`;
}

/**
 * Given a directory, determine the platform type.
 * @param dirPath The directory to scan.
 * @return A list of platforms detected.
 */
export async function getPlatformsFromFolder(dirPath: string): Promise<Platform[]> {
  const apps = await detectApps(dirPath);
  return [...new Set(apps.map((app) => app.platform))];
}

/**
 * Detects the apps in a given directory.
 * @param dirPath The current working directory to scan.
 * @return A list of apps detected.
 */
export async function detectApps(dirPath: string): Promise<App[]> {
  const packageJsonFiles = await detectFiles(dirPath, "package.json");
  const pubSpecYamlFiles = await detectFiles(dirPath, "pubspec.yaml");
  const srcMainFolders = await detectFiles(dirPath, "src/main/");
  const xCodeProjects = await detectFiles(dirPath, "*.xcodeproj/");
  const adminAndWebApps = (
    await Promise.all(packageJsonFiles.map((p) => packageJsonToAdminOrWebApp(dirPath, p)))
  ).flat();
  console.log("packageJsonFiles", packageJsonFiles);
  console.log("adminAndWebApps", adminAndWebApps);

  const flutterAppPromises = await Promise.all(
    pubSpecYamlFiles.map((f) => processFlutterDir(dirPath, f)),
  );
  const flutterApps = flutterAppPromises.flat();

  const androidAppPromises = await Promise.all(
    srcMainFolders.map((f) => processAndroidDir(dirPath, f)),
  );
  const androidApps = androidAppPromises
    .flat()
    .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));

  const iosAppPromises = await Promise.all(xCodeProjects.map((f) => processIosDir(dirPath, f)));
  const iosApps = iosAppPromises
    .flat()
    .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));
  return [...flutterApps, ...androidApps, ...iosApps, ...adminAndWebApps];
}

async function processIosDir(dirPath: string, filePath: string): Promise<App[]> {
  // Search for apps in the parent directory
  const iosDir = path.dirname(filePath);
  const iosAppIds = await detectAppIdsForPlatform(dirPath, Platform.IOS);
  if (iosAppIds.length === 0) {
    return [
      {
        platform: Platform.IOS,
        directory: iosDir,
      },
    ];
  }
  const iosApps = await Promise.all(
    iosAppIds.map((app) => ({
      platform: Platform.IOS,
      directory: iosDir,
      appId: app.appId,
      bundleId: app.bundleId,
    })),
  );
  return iosApps.flat();
}

async function processAndroidDir(dirPath: string, filePath: string): Promise<App[]> {
  // Search for apps in the parent directory, not in the src/main directory
  const androidDir = path.dirname(path.dirname(filePath));
  const androidAppIds = await detectAppIdsForPlatform(dirPath, Platform.ANDROID);

  if (androidAppIds.length === 0) {
    return [
      {
        platform: Platform.ANDROID,
        directory: androidDir,
      },
    ];
  }

  const androidApps = await Promise.all(
    androidAppIds.map((app) => ({
      platform: Platform.ANDROID,
      directory: androidDir,
      appId: app.appId,
      bundleId: app.bundleId,
    })),
  );
  return androidApps.flat();
}

async function processFlutterDir(dirPath: string, filePath: string): Promise<App[]> {
  const flutterDir = path.dirname(filePath);
  const flutterAppIds = await detectAppIdsForPlatform(dirPath, Platform.FLUTTER);

  if (flutterAppIds.length === 0) {
    return [
      {
        platform: Platform.FLUTTER,
        directory: flutterDir,
      },
    ];
  }

  const flutterApps = await Promise.all(
    flutterAppIds.map((app) => {
      const flutterApp: App = {
        platform: Platform.FLUTTER,
        directory: flutterDir,
        appId: app.appId,
        bundleId: app.bundleId,
      };
      return flutterApp;
    }),
  );

  return flutterApps.flat();
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);
  return !relativePath.startsWith(`..`);
}

export function getAllDepsFromPackageJson(packageJson: PackageJSON) {
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const allDeps = Array.from(new Set([...devDependencies, ...dependencies]));
  return allDeps;
}

async function packageJsonToAdminOrWebApp(
  dirPath: string,
  packageJsonFile: string,
): Promise<App[]> {
  const fullPath = path.join(dirPath, packageJsonFile);
  const packageJson = JSON.parse((await fs.readFile(fullPath)).toString()) as PackageJSON;
  const allDeps = getAllDepsFromPackageJson(packageJson);
  const detectedApps = [];
  if (allDeps.includes("firebase-admin") || allDeps.includes("firebase-functions")) {
    detectedApps.push({
      platform: Platform.ADMIN_NODE,
      directory: path.dirname(packageJsonFile),
    });
  }
  if (allDeps.includes("firebase") || detectedApps.length === 0) {
    detectedApps.push({
      platform: Platform.WEB,
      directory: path.dirname(packageJsonFile),
      frameworks: getFrameworksFromPackageJson(packageJson),
    });
  }
  return detectedApps;
}

const WEB_FRAMEWORKS: Framework[] = Object.values(Framework);
const WEB_FRAMEWORKS_SIGNALS: { [key in Framework]: string[] } = {
  react: ["react", "next"],
  angular: ["@angular/core"],
};

async function detectAppIdsForPlatform(
  dirPath: string,
  platform: Platform,
): Promise<AppIdentifier[]> {
  let appIdFiles;
  let extractFunc: (fileContent: string) => AppIdentifier[];
  switch (platform) {
    // Leaving web out of the mix for now because we have no strong conventions
    // around where to put Firebase config. It could be anywhere in your codebase.
    case Platform.ANDROID:
      appIdFiles = await detectFiles(dirPath, "google-services*.json*");
      extractFunc = extractAppIdentifiersAndroid;
      break;
    case Platform.IOS:
      appIdFiles = await detectFiles(dirPath, "GoogleService-*.plist*");
      extractFunc = extractAppIdentifierIos;
      break;
    case Platform.FLUTTER:
      appIdFiles = await detectFiles(dirPath, "firebase_options.dart");
      extractFunc = extractAppIdentifiersFlutter;
      break;
    default:
      return [];
  }

  const allAppIds = await Promise.all(
    appIdFiles.map(async (file) => {
      const fileContent = (await fs.readFile(path.join(dirPath, file))).toString();
      return extractFunc(fileContent);
    }),
  );
  return allAppIds.flat();
}

function getFrameworksFromPackageJson(packageJson: PackageJSON): Framework[] {
  const allDeps = getAllDepsFromPackageJson(packageJson);
  return WEB_FRAMEWORKS.filter((framework) =>
    WEB_FRAMEWORKS_SIGNALS[framework].find((dep) => allDeps.includes(dep)),
  );
}

/**
 * Reads a firebase_options.dart file and extracts all appIds and bundleIds.
 * @param fileContent content of the dart file.
 * @return a list of appIds and bundleIds.
 */
export function extractAppIdentifiersFlutter(fileContent: string): AppIdentifier[] {
  const optionsRegex = /FirebaseOptions\(([^)]*)\)/g;
  const appIdRegex = /appId: '([^']*)'/;
  const bundleIdRegex = /iosBundleId: '([^']*)'/;
  const matches = fileContent.matchAll(optionsRegex);
  const identifiers: AppIdentifier[] = [];
  for (const match of matches) {
    const optionsContent = match[1];
    const appIdMatch = appIdRegex.exec(optionsContent);
    const bundleIdMatch = bundleIdRegex.exec(optionsContent);
    if (appIdMatch?.[1]) {
      identifiers.push({
        appId: appIdMatch[1],
        bundleId: bundleIdMatch?.[1],
      });
    }
  }

  return identifiers;
}

/**
 * Reads a GoogleService-Info.plist file and extracts the GOOGLE_APP_ID and BUNDLE_ID.
 * @param fileContent content of the plist file.
 * @return The GOOGLE_APP_ID and BUNDLE_ID or an empty array.
 */
export function extractAppIdentifierIos(fileContent: string): AppIdentifier[] {
  const appIdRegex = /<key>GOOGLE_APP_ID<\/key>\s*<string>([^<]*)<\/string>/;
  const bundleIdRegex = /<key>BUNDLE_ID<\/key>\s*<string>([^<]*)<\/string>/;
  const appIdMatch = fileContent.match(appIdRegex);
  const bundleIdMatch = fileContent.match(bundleIdRegex);
  if (appIdMatch?.[1]) {
    return [
      {
        appId: appIdMatch[1],
        bundleId: bundleIdMatch?.[1],
      },
    ];
  }
  return [];
}

/**
 * Reads a google-services.json file and extracts all mobilesdk_app_id and package_name values.
 * @param fileContent content of the google-services.json file.
 * @return a list of mobilesdk_app_id and package_name values.
 */
export function extractAppIdentifiersAndroid(fileContent: string): AppIdentifier[] {
  const identifiers: AppIdentifier[] = [];
  try {
    const config = JSON.parse(fileContent);
    if (config.client && Array.isArray(config.client)) {
      for (const client of config.client) {
        if (client.client_info?.mobilesdk_app_id) {
          identifiers.push({
            appId: client.client_info.mobilesdk_app_id,
            bundleId: client.client_info.android_client_info?.package_name,
          });
        }
      }
    }
  } catch (e) {
    // Handle parsing errors if necessary
    console.error("Error parsing google-services.json:", e);
  }
  return identifiers;
}

/**
 * Detects files matching a pattern within a directory, ignoring common dependency and build folders.
 * @param dirPath The directory to search in.
 * @param filePattern The glob pattern for the files to detect (e.g., "*.json").
 * @return A promise that resolves to an array of file paths relative to `dirPath`.
 */
export async function detectFiles(dirPath: string, filePattern: string): Promise<string[]> {
  const options = {
    cwd: dirPath,
    ignore: [
      "**/dataconnect*/**",
      "**/node_modules/**", // Standard dependency directory
      "**/dist/**", // Common build output
      "**/build/**", // Common build output
      "**/out/**", // Another common build output
      "**/.next/**", // Next.js build directory
      "**/coverage/**", // Test coverage reports
    ],
    absolute: false,
  };
  return glob(`**/${filePattern}`, options);
}
