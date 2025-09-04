import * as tmp from "tmp";
import * as path from "path";
import { spawnSync, SpawnSyncReturns } from "child_process";
import { FirebaseError, hasMessage } from "../../error";
import { logger } from "../../logger";
import { logLabeledBullet } from "../../utils";
import * as fs from "fs";
import { resolveWithin } from "../../pathUtils";

export interface GitClient {
  clone(repository: string, destination: string): SpawnSyncReturns<string>;
  fetch(ref: string, cwd: string): SpawnSyncReturns<string>;
  checkout(ref: string, cwd: string): SpawnSyncReturns<string>;
  initSparseCheckout(cwd: string): SpawnSyncReturns<string>;
  setSparsePaths(paths: string[], cwd: string): SpawnSyncReturns<string>;
}

export class DefaultGitClient implements GitClient {
  clone(repository: string, destination: string): SpawnSyncReturns<string> {
    return spawnSync(
      "git",
      ["clone", "--filter=blob:none", "--no-checkout", "--depth=1", repository, destination],
      { encoding: "utf8" },
    );
  }

  fetch(ref: string, cwd: string): SpawnSyncReturns<string> {
    return spawnSync("git", ["fetch", "--depth=1", "--filter=blob:none", "origin", ref], {
      cwd,
      encoding: "utf8",
    });
  }

  checkout(ref: string, cwd: string): SpawnSyncReturns<string> {
    return spawnSync("git", ["checkout", ref], { cwd, encoding: "utf8" });
  }

  initSparseCheckout(cwd: string): SpawnSyncReturns<string> {
    return spawnSync("git", ["sparse-checkout", "init", "--cone"], { cwd, encoding: "utf8" });
  }

  setSparsePaths(paths: string[], cwd: string): SpawnSyncReturns<string> {
    return spawnSync("git", ["sparse-checkout", "set", ...paths], { cwd, encoding: "utf8" });
  }
}

export async function cloneRemoteSource(
  repository: string,
  ref: string,
  dir?: string,
  gitClient: GitClient = new DefaultGitClient(),
): Promise<string> {
  /**
   * Shallow‑clones a Git repo to a temporary directory and returns the
   * absolute path to the source directory. If `dir` is provided, performs a
   * sparse checkout of that subdirectory. Verifies that a `functions.yaml`
   * manifest exists before returning. Throws `FirebaseError` with actionable
   * messages on common failures (network, auth, bad ref, missing directory).
   *
   * @param repository Remote Git URL (e.g. https://github.com/org/repo)
   * @param ref Git ref to fetch (tag/branch/commit)
   * @param dir Optional subdirectory within the repo to use
   * @param gitClient Optional Git client for testing/injection
   * @returns Absolute path to the checked‑out source directory
   */
  logger.debug(`Cloning remote source: ${repository}@${ref} (dir: ${dir || "."})`);

  const tmpDir = tmp.dirSync({
    prefix: "firebase-functions-remote-",
    unsafeCleanup: true,
  });

  if (!isGitAvailable()) {
    throw new FirebaseError(
      "Git is required to deploy functions from a remote source. " +
        "Please install Git from https://git-scm.com/downloads and try again.",
    );
  }

  try {
    // Info-level, labeled logging is handled by the caller (prepare.ts).
    // Keep clone details at debug to avoid duplicate, unlabeled lines.
    logger.debug(`Fetching remote source for ${repository}@${ref}...`);

    const cloneResult = await runGitWithRetry(() => gitClient.clone(repository, tmpDir.name));
    if (cloneResult.error || cloneResult.status !== 0) {
      throw new Error(cloneResult.stderr || cloneResult.stdout || "Clone failed");
    }

    // If a subdirectory is specified, use sparse checkout to limit the working tree.
    if (dir) {
      const initSparse = gitClient.initSparseCheckout(tmpDir.name);
      if (initSparse.error || initSparse.status !== 0) {
        throw new Error(initSparse.stderr || initSparse.stdout || "Sparse checkout init failed");
      }
      const setSparse = gitClient.setSparsePaths([dir], tmpDir.name);
      if (setSparse.error || setSparse.status !== 0) {
        throw new FirebaseError(`Directory '${dir}' not found in repository ${repository}@${ref}`);
      }
    }

    // Fetch just the requested ref shallowly, then check it out.
    const fetchResult = await runGitWithRetry(() => gitClient.fetch(ref, tmpDir.name));
    if (fetchResult.error || fetchResult.status !== 0) {
      throw new Error(fetchResult.stderr || fetchResult.stdout || "Fetch failed");
    }

    const checkoutResult = gitClient.checkout("FETCH_HEAD", tmpDir.name);
    if (checkoutResult.error || checkoutResult.status !== 0) {
      throw new Error(checkoutResult.stderr || checkoutResult.stdout || "Checkout failed");
    }

    const sourceDir = dir
      ? resolveWithin(
          tmpDir.name,
          dir,
          `Subdirectory '${dir}' in remote source must not escape the repository root.`,
        )
      : tmpDir.name;
    requireFunctionsYaml(sourceDir);
    const origin = `${repository}@${ref}${dir ? `/${dir}` : ""}`;
    let sha: string | undefined;
    const rev = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: tmpDir.name,
      encoding: "utf8",
    });
    if (!rev.error && rev.status === 0) {
      sha = rev.stdout.trim();
    } else if (rev.error) {
      logger.debug("Failed to get git revision for logging:", rev.error);
    }
    if (sha) {
      logLabeledBullet("functions", `verified functions.yaml for ${origin}; using commit ${sha}`);
    } else {
      logLabeledBullet("functions", `verified functions.yaml in remote source (${origin})`);
    }
    logger.debug(`Successfully cloned to ${sourceDir}`);
    return sourceDir;
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      throw error;
    }

    const errorMessage = hasMessage(error) ? error.message : String(error);
    if (
      errorMessage.includes("Could not resolve host") ||
      errorMessage.includes("unable to access")
    ) {
      throw new FirebaseError(
        `Unable to access repository '${repository}'. ` +
          `Please check the repository URL and your network connection.`,
      );
    }
    if (errorMessage.includes("pathspec") || errorMessage.includes("did not match")) {
      throw new FirebaseError(
        `Git ref '${ref}' not found in repository '${repository}'. ` +
          `Please check that the ref (tag, branch, or commit) exists.`,
      );
    }
    if (
      errorMessage.includes("Permission denied") ||
      errorMessage.includes("Authentication failed")
    ) {
      throw new FirebaseError(
        `Authentication failed for repository '${repository}'. ` +
          `For private repositories, please ensure you have configured Git authentication.`,
      );
    }

    throw new FirebaseError(`Failed to clone repository '${repository}@${ref}': ${errorMessage}`);
  }
}

/**
 * Checks whether the `git` binary is available in the current environment.
 * @returns true if `git --version` runs successfully; false otherwise.
 */
export function isGitAvailable(): boolean {
  const result = spawnSync("git", ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not resolve host") ||
    m.includes("unable to access") ||
    m.includes("connection reset") ||
    m.includes("timed out") ||
    m.includes("temporary failure in name resolution") ||
    m.includes("ssl_read") ||
    m.includes("network is unreachable")
  );
}

async function runGitWithRetry(
  cmd: () => SpawnSyncReturns<string>,
  retries = 1,
  backoffMs = 200,
): Promise<SpawnSyncReturns<string>> {
  let attempt = 0;
  while (true) {
    const res = cmd();
    if (!res.error && res.status === 0) {
      return res;
    }
    const stderr = (res.stderr || res.stdout || "").toString();
    if (attempt < retries && isTransientGitError(stderr)) {
      await delay(backoffMs * (attempt + 1));
      attempt++;
      continue;
    }
    return res;
  }
}

/**
 * Verifies that a `functions.yaml` manifest exists at the given directory.
 * Throws a FirebaseError with guidance if it is missing.
 */
export function requireFunctionsYaml(codeDir: string): void {
  const functionsYamlPath = path.join(codeDir, "functions.yaml");
  if (!fs.existsSync(functionsYamlPath)) {
    throw new FirebaseError(
      `The remote repository is missing a required deployment manifest (functions.yaml).\n\n` +
        `For your security, Firebase requires a static manifest to deploy functions from a remote source. ` +
        `This prevents the execution of arbitrary code on your machine during the function discovery process.\n\n` +
        `To resolve this, clone the repository locally, inspect the code for safety, and deploy it as a local source.`,
    );
  }
}
