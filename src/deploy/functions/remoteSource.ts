import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import fetch from "node-fetch";
import * as yaml from "js-yaml";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { unzip } from "../../unzip";

export interface RemoteSourceConfig {
  repo: string;
  ref: string;
  path?: string;
}

/**
 * Constructs the GitHub archive URL for a given repository and ref.
 */
function getGitHubArchiveUrl(repo: string, ref: string): string {
  // Extract owner and repo name from the URL
  const match = repo.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    throw new FirebaseError(`Invalid GitHub repository URL: ${repo}`);
  }
  
  const [, owner, repoName] = match;
  
  // Handle different ref types
  if (ref.length === 40 && /^[a-f0-9]+$/.test(ref)) {
    // Looks like a commit SHA
    return `https://github.com/${owner}/${repoName}/archive/${ref}.zip`;
  } else if (ref.includes("/")) {
    // Likely a branch with slashes (e.g., feature/branch-name)
    return `https://github.com/${owner}/${repoName}/archive/refs/heads/${ref}.zip`;
  } else {
    // Could be a tag or simple branch name
    // Try branch format first, GitHub will redirect if it's a tag
    return `https://github.com/${owner}/${repoName}/archive/refs/heads/${ref}.zip`;
  }
}

/**
 * Downloads a file from a URL to a temporary location.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  logger.debug(`Downloading ${url} to ${destPath}`);
  
  // Use CLI version from package.json for consistent user agent
  const pkg = require("../../../package.json");
  const CLI_VERSION: string = pkg.version;
  
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': `FirebaseCLI/${CLI_VERSION}`
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new FirebaseError(
        `Repository or ref not found. Please check that the repository and ref exist and are publicly accessible.`
      );
    }
    throw new FirebaseError(`Failed to download archive: ${response.status} ${response.statusText}`);
  }
  
  const fileStream = fs.createWriteStream(destPath);
  
  return new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on("error", reject);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
}

/**
 * Extracts a zip archive to a directory.
 * Returns the path to the extracted content (handling GitHub's directory structure).
 */
async function extractArchive(zipPath: string, extractDir: string): Promise<string> {
  logger.debug(`Extracting ${zipPath} to ${extractDir}`);
  
  await unzip(zipPath, extractDir);
  
  // GitHub archives have a top-level directory like "repo-ref/"
  // We need to find and return the actual source directory
  const entries = fs.readdirSync(extractDir);
  if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
    return path.join(extractDir, entries[0]);
  } else {
    return extractDir;
  }
}

/**
 * Validates that a directory contains a valid Firebase Functions project.
 * Currently requires the presence of functions.yaml file.
 */
function validateFunctionsDirectory(sourceDir: string): void {
  const functionsYamlPath = path.join(sourceDir, "functions.yaml");
  
  if (!fs.existsSync(functionsYamlPath)) {
    throw new FirebaseError(
      `Remote source does not contain functions.yaml. ` +
      `This file is required for remote function sources to ensure they are valid Firebase Functions projects.`
    );
  }
  
  // Validate that functions.yaml is valid YAML
  try {
    const content = fs.readFileSync(functionsYamlPath, "utf8");
    yaml.load(content);
  } catch (err) {
    throw new FirebaseError(
      `Invalid functions.yaml in remote source: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  
  logger.debug(`Found valid functions.yaml in remote source`);
}

/**
 * Prepares a remote source for deployment by downloading and extracting it.
 * Returns the path to the extracted source directory.
 */
export async function prepareRemoteSource(
  remoteSource: RemoteSourceConfig,
  codebase: string,
  projectRoot?: string
): Promise<{ sourceDir: string; projectRoot: string }> {
  // Use tmp directory that auto-cleans on process exit
  const tmpDir = tmp.dirSync({ prefix: `firebase-functions-${codebase}-`, unsafeCleanup: true });
  const tmpZipFile = tmp.fileSync({ prefix: `firebase-functions-${codebase}-`, postfix: ".zip" });
  
  try {
    logLabeledBullet(
      "functions",
      `downloading remote source from ${remoteSource.repo} (ref: ${remoteSource.ref})`
    );
    
    const archiveUrl = getGitHubArchiveUrl(remoteSource.repo, remoteSource.ref);
    await downloadFile(archiveUrl, tmpZipFile.name);
    
    logLabeledBullet(
      "functions",
      "extracting remote source..."
    );
    
    let sourceDir = await extractArchive(tmpZipFile.name, tmpDir.name);
    
    // Clean up the zip file immediately
    try {
      fs.unlinkSync(tmpZipFile.name);
    } catch (err) {
      logger.debug(`Failed to clean up temporary zip file: ${err}`);
    }
    
    // If a path is specified, navigate to that subdirectory
    if (remoteSource.path) {
      const subDir = path.join(sourceDir, remoteSource.path);
      if (!fs.existsSync(subDir)) {
        throw new FirebaseError(
          `Specified path '${remoteSource.path}' does not exist in the remote repository`
        );
      }
      if (!fs.statSync(subDir).isDirectory()) {
        throw new FirebaseError(
          `Specified path '${remoteSource.path}' is not a directory`
        );
      }
      sourceDir = subDir;
      logger.debug(`Using subdirectory: ${remoteSource.path}`);
    }
    
    // Validate that this is a valid functions directory
    try {
      validateFunctionsDirectory(sourceDir);
    } catch (validationError) {
      // Show helpful error message
      logLabeledWarning(
        "functions",
        "Remote source validation failed. This may not be a valid Firebase Functions project."
      );
      if (remoteSource.path) {
        logLabeledWarning(
          "functions",
          `Make sure functions.yaml exists at: ${remoteSource.path}/functions.yaml`
        );
      }
      throw validationError;
    }
    
    logLabeledBullet(
      "functions",
      `remote source prepared at ${sourceDir}`
    );
    
    return { 
      sourceDir, 
      projectRoot: projectRoot || process.cwd() 
    };
  } catch (error) {
    // Temporary files will be cleaned up automatically by the OS
    
    if (error instanceof FirebaseError) {
      throw error;
    }
    
    throw new FirebaseError(
      `Failed to prepare remote source: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}