import * as path from "path";
import * as fs from "fs-extra";
import { glob } from "glob";

export type SupportedPlatform = "ios" | "android" | "web";

/**
 * Represents the local Firebase app configuration state in the project directory
 */
export interface LocalFirebaseAppState {
  platform: SupportedPlatform;
  configFilePath: string;
  bundleId?: string;
  packageName?: string;
  webAppId?: string;
}

/**
 * Returns the Firebase configuration filename for a given platform
 */
export function getFirebaseConfigFileName(platform: SupportedPlatform): string {
  switch (platform) {
    case "ios":
      return "GoogleService-Info.plist";
    case "android":
      return "google-services.json";
    case "web":
      return "firebase-config.json";
    default:
      throw new Error(`Unsupported platform: ${platform as string}`);
  }
}

/**
 * Returns the full file path for Firebase configuration file in the given app directory
 */
export function getFirebaseConfigFilePath(
  appDirectory: string,
  platform: SupportedPlatform,
): string {
  const filename = getFirebaseConfigFileName(platform);
  return path.join(appDirectory, filename);
}

/**
 * Extracts bundle identifier from iOS plist file
 */
export function extractBundleIdFromPlist(plistPath: string): string {
  try {
    const fileContent = fs.readFileSync(plistPath, "utf8");
    const bundleIdMatch = /<key>BUNDLE_ID<\/key>\s*<string>(.*?)<\/string>/u.exec(fileContent);

    if (!bundleIdMatch?.[1]) {
      throw new Error(`BUNDLE_ID not found in plist file`);
    }

    return bundleIdMatch[1];
  } catch (error) {
    throw new Error(`Failed to parse iOS plist file: ${plistPath}`);
  }
}

/**
 * Checks if Android google-services.json file contains the specified package name
 */
export function hasPackageNameInAndroidConfig(jsonPath: string, packageName: string): boolean {
  try {
    const fileContent = fs.readFileSync(jsonPath, "utf8");
    const config = JSON.parse(fileContent) as {
      client?: Array<{
        client_info?: {
          android_client_info?: { package_name?: string };
        };
      }>;
    };

    if (!config.client) {
      return false;
    }

    // Check if any client has the specified package name
    return config.client.some(
      (client) => client.client_info?.android_client_info?.package_name === packageName,
    );
  } catch (error) {
    return false;
  }
}

/**
 * Generates a unique directory name for a new app, avoiding conflicts with existing directories
 */
export function generateUniqueAppDirectoryName(
  projectDirectory: string,
  platform: SupportedPlatform,
): string {
  let directoryName: string = platform;
  let counter = 1;

  while (fs.existsSync(path.join(projectDirectory, directoryName)) && counter < 1000) {
    counter++;
    directoryName = `${platform}-${counter}`;
  }

  return directoryName;
}

/**
 * Common utility to find files using glob patterns
 */
async function findConfigFiles(projectDirectory: string, pattern: string): Promise<string[]> {
  const files = await glob(pattern, {
    cwd: projectDirectory,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.*/**"],
  });
  return files;
}

/**
 * Finds existing iOS app with the given bundle ID
 */
export async function findExistingIosApp(
  projectDirectory: string,
  bundleId: string,
): Promise<LocalFirebaseAppState | undefined> {
  const iosPlistFiles = await findConfigFiles(projectDirectory, "**/GoogleService-Info.plist");

  for (const configFilePath of iosPlistFiles) {
    try {
      const existingBundleId = extractBundleIdFromPlist(configFilePath);
      if (existingBundleId === bundleId) {
        return {
          platform: "ios",
          configFilePath,
          bundleId: existingBundleId,
        };
      }
    } catch (error) {
      continue;
    }
  }

  return undefined;
}

/**
 * Finds existing Android app with the given package name
 */
export async function findExistingAndroidApp(
  projectDirectory: string,
  packageName: string,
): Promise<LocalFirebaseAppState | undefined> {
  const androidJsonFiles = await findConfigFiles(projectDirectory, "**/google-services.json");

  for (const configFilePath of androidJsonFiles) {
    try {
      if (hasPackageNameInAndroidConfig(configFilePath, packageName)) {
        return {
          platform: "android",
          configFilePath,
          packageName: packageName,
        };
      }
    } catch (error) {
      continue;
    }
  }

  return undefined;
}

/**
 * Writes config file from base64 data with proper decoding
 */
export function writeAppConfigFile(filePath: string, base64Data: string): void {
  try {
    const configContent = Buffer.from(base64Data, "base64").toString("utf8");
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, configContent, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to write config file to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extracts project ID from app resource name
 */
export function extractProjectIdFromAppResource(appResource: string): string {
  const match = /^projects\/([^/]+)/.exec(appResource);
  if (!match) {
    throw new Error(`Invalid app resource format: ${appResource}`);
  }
  return match[1];
}
