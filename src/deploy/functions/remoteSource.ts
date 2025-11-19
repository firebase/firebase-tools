import * as fs from "fs";
import * as path from "path";

import { URL } from "url";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { logLabeledBullet, resolveWithin } from "../../utils";
import { dirExistsSync, fileExistsSync } from "../../fsutils";
import * as downloadUtils from "../../downloadUtils";
import * as unzipModule from "../../unzip";

/**
 * Downloads a remote source to a temporary directory and returns the absolute path
 * to the source directory. 
 * 
 * @param repository Remote URL (e.g. https://github.com/org/repo) or shorthand (org/repo)
 * @param ref Git ref to fetch (tag/branch/commit)
 * @param destDir Directory to extract the source code to
 * @param subDir Optional subdirectory within the repo to use
 * @return Absolute path to the checked‑out source directory
 */
export async function getRemoteSource(
  repository: string,
  ref: string,
  destDir: string,
  subDir?: string,
): Promise<string> {
  logger.debug(
    `Downloading remote source: ${repository}@${ref} (destDir: ${destDir}, subDir: ${subDir || "."})`,
  );

  const gitHubInfo = parseGitHubUrl(repository);
  if (!gitHubInfo) {
    throw new FirebaseError(
      `Could not parse GitHub repository URL: ${repository}. ` +
        `Only GitHub repositories are supported.`,
    );
  }

  let rootDir = destDir;
  try {
    logger.debug(`Attempting to download via GitHub Archive API for ${repository}@${ref}...`);
    const archiveUrl = `https://github.com/${gitHubInfo.owner}/${gitHubInfo.repo}/archive/${ref}.zip`;
    const archivePath = await downloadUtils.downloadToTmp(archiveUrl);
    logger.debug(`Downloaded archive to ${archivePath}, unzipping...`);

    await unzipModule.unzip(archivePath, destDir);

    // GitHub archives usually wrap content in a top-level directory (e.g. repo-ref).
    // We need to find it and use it as the root.
    const files = fs.readdirSync(destDir);

    if (files.length === 1 && fs.statSync(path.join(destDir, files[0])).isDirectory()) {
      rootDir = path.join(destDir, files[0]);
      logger.debug(`Found top-level directory in archive: ${files[0]}`);
    }
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to download GitHub archive for ${repository}@${ref}. ` +
        `Make sure the repository is public and the ref exists. ` +
        `Private repositories are not supported via this method.`,
      { original: err as Error },
    );
  }

  const sourceDir = subDir
    ? resolveWithin(
        rootDir,
        subDir,
        `Subdirectory '${subDir}' in remote source must not escape the repository root.`,
      )
    : rootDir;

  if (subDir && !dirExistsSync(sourceDir)) {
    throw new FirebaseError(`Directory '${subDir}' not found in repository ${repository}@${ref}`);
  }

  const origin = `${repository}@${ref}${subDir ? `/${subDir}` : ""}`;
  logLabeledBullet("functions", `downloaded remote source (${origin})`);
  return sourceDir;
}

/**
 * Parses a GitHub repository URL or shorthand string into its owner and repo components.
 *
 * Valid inputs include:
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 * - "owner/repo"
 * @param url The URL or shorthand string to parse.
 * @return An object containing the owner and repo, or undefined if parsing fails.
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
  // Handle "org/repo" shorthand
  const shorthandMatch = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+$/.exec(url);
  if (shorthandMatch) {
    const [owner, repo] = url.split("/");
    return { owner, repo };
  }

  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") {
      return undefined;
    }
    const parts = u.pathname.split("/").filter((p) => !!p);
    if (parts.length < 2) {
      return undefined;
    }
    const owner = parts[0];
    let repo = parts[1];
    if (repo.endsWith(".git")) {
      repo = repo.slice(0, -4);
    }
    return { owner, repo };
  } catch {
    return undefined;
  }
}

/**
 * Verifies that a `functions.yaml` manifest exists at the given directory.
 * Throws a FirebaseError with guidance if it is missing.
 */
export function requireFunctionsYaml(codeDir: string): void {
  const functionsYamlPath = path.join(codeDir, "functions.yaml");
  if (!fileExistsSync(functionsYamlPath)) {
    throw new FirebaseError(
      `The remote repository is missing a required deployment manifest (functions.yaml).\n\n` +
        `For your security, Firebase requires a static manifest to deploy functions from a remote source. ` +
        `This prevents the execution of arbitrary code on your machine during the function discovery process.\n\n` +
        `If you trust this repository and want to use it anyway, clone the repository locally, inspect the code for safety, and deploy it as a local source.`,
    );
  }
}
