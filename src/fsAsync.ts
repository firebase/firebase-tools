import { readdirSync, statSync, readFileSync } from "fs-extra";
import ignorePkg from "ignore";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import { join, relative } from "path";
import { logger } from "./logger";

export interface ReaddirRecursiveOpts {
  // The directory to recurse.
  path: string;
  // Array of glob patterns representing files and folders to ignore.
  // Note: The matching behavior changes depending on the supportGitIgnore option.
  ignoreStrings?: string[];
  // When true, ignoreStrings are matched using the GitIgnore spec rules (supporting negations and scope priorities)
  // and local nested .gitignore files are discovered and stacked automatically.
  // When false or undefined, ignoreStrings are matched flatly using simple minimatch wildcard globs.
  supportGitIgnore?: boolean;
  // Files in the ignore array to include.
  include?: string[];
  // Maximum depth to recurse.
  maxDepth?: number;
  /**
   * Ignore symlinked files or directories when traversing.
   *
   * **Defaults to `true`** for security: following symlinks during deploy/upload
   * lets a path inside the source tree leak the contents of an arbitrary path
   * outside it (including secrets like `/proc/self/environ`, SSH keys, or other
   * credentials reachable from the deploy process). Pass `false` only if you
   * have an audited reason to follow symlinks.
   *
   * If a symlink is encountered while this is `true`, the entry is silently
   * dropped from the recursion (matching the prior `ignoreSymlinks: true`
   * behavior). A `debug`-level log entry is emitted to aid debugging.
   */
  ignoreSymlinks?: boolean;
}

export interface ReaddirRecursiveFile {
  name: string;
  mode: number;
}

export interface GitIgnoreState {
  dirPath: string;
  ignore: ReturnType<typeof ignorePkg>;
}

async function readdirRecursiveHelper(options: {
  path: string;
  filter: (p: string, gitIgnoreStack?: GitIgnoreState[]) => boolean;
  maxDepth: number;
  ignoreSymlinks: boolean;
  supportGitIgnore?: boolean;
  gitIgnoreStack?: GitIgnoreState[];
}): Promise<ReaddirRecursiveFile[]> {
  const dirContents = readdirSync(options.path, { withFileTypes: true });

  let currentGitIgnoreStack = options.gitIgnoreStack || [];
  // Load and stack directory-specific .gitignore rules if supportGitIgnore is enabled
  if (options.supportGitIgnore) {
    if (dirContents.find((n) => n.name === ".gitignore")?.isFile()) {
      const localGitIgnore = join(options.path, ".gitignore");
      try {
        const lines = readFileSync(localGitIgnore)
          .toString()
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => !line.startsWith("#") && line !== "");
        const subIgnore = ignorePkg().add(lines);
        currentGitIgnoreStack = [
          ...currentGitIgnoreStack,
          {
            dirPath: options.path,
            ignore: subIgnore,
          },
        ];
      } catch (e: unknown) {
        logger.debug(`Error reading .gitignore file at ${localGitIgnore}:`, e);
      }
    }
  }
  const fullPaths = dirContents
    .filter((n) => {
      if (options.ignoreSymlinks && n.isSymbolicLink()) {
        logger.debug(
          `[fsAsync] dropping symlink ${join(options.path, n.name)} ` +
            `(set ignoreSymlinks:false to include it)`,
        );
        return false;
      }
      return true;
    })
    .map((n) => join(options.path, n.name));
  const filteredPaths = fullPaths.filter((p) => !options.filter(p, currentGitIgnoreStack));
  const filePromises: Array<Promise<ReaddirRecursiveFile | ReaddirRecursiveFile[]>> = [];
  for (const p of filteredPaths) {
    const fstat = statSync(p);
    if (fstat.isFile()) {
      filePromises.push(Promise.resolve({ name: p, mode: fstat.mode }));
    }
    if (!fstat.isDirectory()) {
      continue;
    }
    if (options.maxDepth > 1) {
      filePromises.push(
        readdirRecursiveHelper({
          path: p,
          filter: options.filter,
          maxDepth: options.maxDepth - 1,
          ignoreSymlinks: options.ignoreSymlinks,
          supportGitIgnore: options.supportGitIgnore,
          gitIgnoreStack: currentGitIgnoreStack,
        }),
      );
    }
  }

  const files = await Promise.all(filePromises);
  let flatFiles = _.flattenDeep(files);
  flatFiles = flatFiles.filter((f) => f !== null);
  return flatFiles;
}

/**
 * Recursively read a directory.
 *
 * **Security note:** `ignoreSymlinks` defaults to `true`. Callers that
 * upload, archive, or otherwise transport the resulting file list across
 * a trust boundary (e.g. Cloud Functions deploy, App Hosting deploy,
 * Hosting upload) MUST keep this default. Passing `false` causes the
 * recursion to follow symlinks and may include arbitrary attacker-controlled
 * targets in the produced file list (e.g. `/proc/self/environ`,
 * `~/.ssh/id_rsa`, GCP application-default-credentials JSON).
 *
 * @param options options object.
 * @return array of files that match.
 */
export async function readdirRecursive(
  options: ReaddirRecursiveOpts,
): Promise<ReaddirRecursiveFile[]> {
  const mmopts = { matchBase: true, dot: true };
  const ignoreRules = (options.ignoreStrings || []).map((glob) => {
    return (p: string) => minimatch(p, glob, mmopts);
  });
  const filter = (targetPath: string, gitIgnoreStack: GitIgnoreState[] = []): boolean => {
    if (options.supportGitIgnore) {
      let ignored = false;
      // Loop in reverse (from deepest subdirectory to root) so that local subdirectory
      // rules take precedence and override any parent directory rules.
      for (let i = gitIgnoreStack.length - 1; i >= 0; i--) {
        const state = gitIgnoreStack[i];
        const relPath = relative(state.dirPath, targetPath);
        const result = state.ignore.test(relPath);
        // Check both properties since:
        // - result.ignored = true means the path is explicitly ignored (e.g. matches "*.txt").
        // - result.unignored = true means the path is explicitly un-ignored via a negation rule (e.g. matches "!foo.txt").
        // - both = false means no rules matched in this scope (so we should proceed to check parent directories).
        if (result.ignored || result.unignored) {
          ignored = result.ignored;
          break;
        }
      }
      return ignored;
    }
    return ignoreRules.some((rule) => {
      return rule(targetPath);
    });
  };

  const initialGitIgnoreStack: GitIgnoreState[] = [];
  if (options.supportGitIgnore) {
    initialGitIgnoreStack.push({
      dirPath: options.path,
      ignore: ignorePkg().add(options.ignoreStrings || []),
    });
  }

  const maxDepth = options.maxDepth && options.maxDepth > 0 ? options.maxDepth : Infinity;
  // Default `ignoreSymlinks` to `true`. See JSDoc above for security rationale.
  const ignoreSymlinks = options.ignoreSymlinks !== false;
  return await readdirRecursiveHelper({
    path: options.path,
    filter: filter,
    maxDepth,
    // Use the secure default computed above (true unless explicitly false),
    // not `!!options.ignoreSymlinks` which would default to following symlinks.
    ignoreSymlinks,
    supportGitIgnore: options.supportGitIgnore,
    gitIgnoreStack: initialGitIgnoreStack,
  });
}
