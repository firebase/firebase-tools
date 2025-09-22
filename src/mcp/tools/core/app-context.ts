import * as path from "path";
import * as fs from "fs-extra";
import { glob } from "glob";

export type SupportedPlatform = "ios" | "android" | "web";

export interface AppInput {
  platform?: SupportedPlatform;
  bundleId?: string;
  packageName?: string;
  webAppId?: string;
}

/**
 * Represents the local Firebase app configuration state in the project directory
 */
export interface LocalFirebaseAppState extends AppInput {
  platform: SupportedPlatform;
  directory: string;
  configFilePath: string;
  shouldCreateDirectory: boolean;
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
 * Validates config file access before writing during provisioning
 */
export function handleConfigFileConflict(configFilePath: string, overwriteConfigs: boolean): void {
  if (fs.existsSync(configFilePath) && !overwriteConfigs) {
    throw new Error(
      `Config file ${configFilePath} already exists. Use overwrite_configs: true to update.`,
    );
  }
}

/**
 * Extracts bundle identifier from iOS plist file
 */
export function extractBundleIdFromPlist(plistPath: string): string {
  try {
    const fileContent = fs.readFileSync(plistPath, "utf8");
    const bundleIdMatch = /<key>CFBundleIdentifier<\/key>\s*<string>(.*?)<\/string>/u.exec(
      fileContent,
    );

    if (!bundleIdMatch?.[1]) {
      throw new Error(`CFBundleIdentifier not found in plist file`);
    }

    return bundleIdMatch[1];
  } catch (error) {
    throw new Error(`Failed to parse iOS plist file: ${plistPath}`);
  }
}

/**
 * Extracts package name from Android google-services.json file
 */
export function extractPackageNameFromAndroidConfig(jsonPath: string): string {
  try {
    const fileContent = fs.readFileSync(jsonPath, "utf8");
    const config = JSON.parse(fileContent) as {
      client?: Array<{
        client_info?: {
          android_client_info?: { package_name?: string };
        };
      }>;
    };
    const packageName = config.client?.[0]?.client_info?.android_client_info?.package_name;

    if (!packageName) {
      throw new Error(`package_name not found in Android config file`);
    }

    return packageName;
  } catch (error) {
    throw new Error(`Failed to parse Android config file: ${jsonPath}`);
  }
}

/**
 * Checks if an existing iOS app with the given bundle ID exists in the project
 * @param projectDirectory - Path to the project directory to scan
 * @param bundleId - iOS bundle identifier to look for
 * @return LocalFirebaseAppState for existing app or undefined if not found
 */
export async function findExistingIosApp(
  projectDirectory: string,
  bundleId: string,
): Promise<LocalFirebaseAppState | undefined> {
  const iosPlistFiles = await glob("**/GoogleService-Info.plist", {
    cwd: projectDirectory,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.*/**"],
  });

  for (const configFilePath of iosPlistFiles) {
    try {
      const existingBundleId = extractBundleIdFromPlist(configFilePath);

      if (existingBundleId === bundleId) {
        const directory = path.dirname(configFilePath);
        return {
          platform: "ios",
          directory,
          configFilePath,
          bundleId: existingBundleId,
          shouldCreateDirectory: false,
        };
      }
    } catch (error) {
      // Skip invalid config files
      continue;
    }
  }

  return undefined;
}

/**
 * Checks if an existing Android app with the given package name exists in the project
 * @param projectDirectory - Path to the project directory to scan
 * @param packageName - Android package name to look for
 * @return LocalFirebaseAppState for existing app or undefined if not found
 */
export async function findExistingAndroidApp(
  projectDirectory: string,
  packageName: string,
): Promise<LocalFirebaseAppState | undefined> {
  const androidJsonFiles = await glob("**/google-services.json", {
    cwd: projectDirectory,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.*/**"],
  });

  for (const configFilePath of androidJsonFiles) {
    try {
      const existingPackageName = extractPackageNameFromAndroidConfig(configFilePath);

      if (existingPackageName === packageName) {
        const directory = path.dirname(configFilePath);
        return {
          platform: "android",
          directory,
          configFilePath,
          packageName: existingPackageName,
          shouldCreateDirectory: false,
        };
      }
    } catch (error) {
      // Skip invalid config files
      continue;
    }
  }

  return undefined;
}
