import { readdirSync, statSync } from "fs-extra";
import ignorePkg from "ignore";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import { join, relative } from "path";
import { logger } from "./logger";

export interface ReaddirRecursiveOpts {
  // The directory to recurse.
  path: string;
  // Files to ignore.
  ignore?: string[];
  isGitIgnore?: boolean;
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

async function readdirRecursiveHelper(options: {
  path: string;
  filter: (p: string) => boolean;
  maxDepth: number;
  ignoreSymlinks: boolean;
}): Promise<ReaddirRecursiveFile[]> {
  const dirContents = readdirSync(options.path, { withFileTypes: true });
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
  const filteredPaths = fullPaths.filter((p) => !options.filter(p));
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
  const rules = (options.ignore || []).map((glob) => {
    return (p: string) => minimatch(p, glob, mmopts);
  });
  const gitIgnoreRules = ignorePkg()
    .add(options.ignore || [])
    .createFilter();

  const filter = (t: string): boolean => {
    if (options.isGitIgnore) {
      // the git ignore filter will return true if given path should be included,
      // so we need to negative that return false to avoid filtering it.
      return !gitIgnoreRules(relative(options.path, t));
    }
    return rules.some((rule) => {
      return rule(t);
    });
  };
  const maxDepth = options.maxDepth && options.maxDepth > 0 ? options.maxDepth : Infinity;
  // Default `ignoreSymlinks` to `true`. See JSDoc above for security rationale.
  const ignoreSymlinks = options.ignoreSymlinks !== false;
  return await readdirRecursiveHelper({
    path: options.path,
    filter: filter,
    maxDepth,
    ignoreSymlinks,
  });
}
