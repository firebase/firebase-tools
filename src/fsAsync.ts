import { join } from "path";
import { readdirSync, statSync } from "fs-extra";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import { existsSync } from "fs";

export interface ReaddirRecursiveOpts {
  // The directory to recurse.
  path: string;
  // Files to ignore.
  ignore?: string[];
  // Files in the ignore array to include.
  include?: string[];
}

export interface ReaddirRecursiveFile {
  name: string;
  mode: number;
}

async function readdirRecursiveHelper(options: {
  path: string;
  filter: (p: string) => boolean;
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
    filePromises.push(readdirRecursiveHelper({ path: p, filter: options.filter }));
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
  const filter = (t: string): boolean => {
    return rules.some((rule) => {
      return rule(t);
    });
  };
  const files = await readdirRecursiveHelper({
    path: options.path,
    filter: filter,
  });
  const filenames = files.map((file) => file.name);

  // Re-include the files may have been previously ignored
  for (const p of options.include || []) {
    if (!existsSync(join(options.path, p))) {
      continue;
    }
    if (filenames.includes(join(options.path, p))) {
      continue;
    }
    const fstat = statSync(join(options.path, p));
    if (fstat.isFile()) {
      files.push({ name: join(options.path, p), mode: fstat.mode });
    } else {
      const filesToInclude = await readdirRecursiveHelper({
        path: join(options.path, p),
        filter: (t: string) => filenames.includes(join(options.path, t)),
      });
      files.push(...filesToInclude);
    }
  }
  return files;
}
