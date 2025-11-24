import { readdirSync, statSync, lstatSync } from "fs-extra";
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
  // Ignore symlinked files or directories when traversing.
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
}): Promise<ReaddirRecursiveFile[]> {
  const dirContents = readdirSync(options.path);
  const fullPaths = dirContents.map((n) => join(options.path, n));
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
        readdirRecursiveHelper({ path: p, filter: options.filter, maxDepth: options.maxDepth - 1 }),
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
    if (options.ignoreSymlinks) {
      const stats = lstatSync(t);
      if (stats.isSymbolicLink()) {
        logger.warn(`Skipping ${t} because it is a symlink.`);
        return true;
      }
    }
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
  return await readdirRecursiveHelper({
    path: options.path,
    filter: filter,
    maxDepth,
  });
}
