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
 * Creates a new app directory and returns the LocalFirebaseAppState
 */
export async function createNewAppDirectory(
  projectDirectory: string,
  platform: SupportedPlatform,
  appInput: AppInput,
): Promise<LocalFirebaseAppState> {
  const directoryName = generateUniqueAppDirectoryName(projectDirectory, platform);
  const fullDirectoryPath = path.join(projectDirectory, directoryName);

  // Create the directory
  await fs.ensureDir(fullDirectoryPath);

  const configFilePath = getFirebaseConfigFilePath(fullDirectoryPath, platform);

  return {
    platform,
    directory: fullDirectoryPath,
    configFilePath,
    shouldCreateDirectory: false, // Already created
    ...appInput,
  };
}

/**
 * Resolves app context by either finding existing app or planning new directory creation
 */
export async function resolveAppContext(
  projectDirectory: string,
  appInput: AppInput,
): Promise<LocalFirebaseAppState> {
  if (!appInput.platform) {
    throw new Error("platform is required in app input");
  }

  const platform = appInput.platform;

  // Try to find existing app (only for iOS/Android with identifiers)
  if (platform === "ios" && appInput.bundleId) {
    const existingApp = await findExistingIosApp(projectDirectory, appInput.bundleId);
    if (existingApp) {
      return existingApp;
    }
  }

  if (platform === "android" && appInput.packageName) {
    const existingApp = await findExistingAndroidApp(projectDirectory, appInput.packageName);
    if (existingApp) {
      return existingApp;
    }
  }

  // No existing app found or web platform - plan new directory
  const directoryName = generateUniqueAppDirectoryName(projectDirectory, platform);
  const fullDirectoryPath = path.join(projectDirectory, directoryName);
  const configFilePath = getFirebaseConfigFilePath(fullDirectoryPath, platform);

  return {
    platform,
    directory: fullDirectoryPath,
    configFilePath,
    shouldCreateDirectory: true,
    ...appInput,
  };
}
