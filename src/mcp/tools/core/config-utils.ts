import * as fs from "fs-extra";
import * as path from "path";

/**
 * Writes config file from base64 data with proper decoding
 */
export async function writeConfigFile(filePath: string, base64Data: string, mimeType: string): Promise<void> {
  try {
    const configContent = Buffer.from(base64Data, 'base64').toString('utf8');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, configContent, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write config file to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extracts project ID from app resource name
 */
export function extractProjectIdFromAppResource(appResource: string): string {
  const match = appResource.match(/^projects\/([^\/]+)/);
  if (!match) {
    throw new Error(`Invalid app resource format: ${appResource}`);
  }
  return match[1];
}

/**
 * Updates .firebaserc with project ID, handling conflicts appropriately
 */
export function updateFirebaseRC(rc: any, projectId: string, overwriteProject: boolean): void {
  if (!rc || !rc.data) {
    throw new Error("Invalid .firebaserc configuration");
  }

  // Check if project already exists
  if (rc.data.projects?.default && rc.data.projects.default !== projectId && !overwriteProject) {
    throw new Error(
      `Project already configured in .firebaserc as '${rc.data.projects.default}'. Use overwrite_project: true to replace.`
    );
  }

  // Update project configuration
  if (!rc.data.projects) {
    rc.data.projects = {};
  }
  rc.data.projects.default = projectId;
}

/**
 * Validates config file path and platform compatibility
 */
export function validateConfigFilePath(filePath: string, platform: string): void {
  const expectedFilenames = {
    ios: "GoogleService-Info.plist",
    android: "google-services.json",
    web: "firebase-config.json",
  };

  const expectedFilename = expectedFilenames[platform as keyof typeof expectedFilenames];
  if (!expectedFilename) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const actualFilename = path.basename(filePath);
  if (actualFilename !== expectedFilename) {
    throw new Error(`Invalid config filename for ${platform}: expected ${expectedFilename}, got ${actualFilename}`);
  }
}