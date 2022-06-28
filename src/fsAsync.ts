/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { join } from "path";
import { readdirSync, statSync } from "fs-extra";
import * as _ from "lodash";
import * as minimatch from "minimatch";

export interface ReaddirRecursiveOpts {
  // The directory to recurse.
  path: string;
  // Files to ignore.
  ignore?: string[];
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
  options: ReaddirRecursiveOpts
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
  return readdirRecursiveHelper({
    path: options.path,
    filter: filter,
  });
}
