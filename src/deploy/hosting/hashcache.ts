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

import * as fs from "fs-extra";
import * as path from "path";

import { logger } from "../../logger";

function cachePath(cwd: string, name: string): string {
  return path.resolve(cwd, `.firebase/hosting.${name}.cache`);
}

export interface HashRecord {
  mtime: number;
  hash: string;
}

/**
 * Load brings in the data from the cache named by `name`.
 */
export function load(cwd: string, name: string): Map<string, HashRecord> {
  try {
    const out = new Map<string, HashRecord>();
    const lines = fs.readFileSync(cachePath(cwd, name), "utf8");
    for (const line of lines.split("\n")) {
      const d = line.split(",");
      if (d.length === 3) {
        out.set(d[0], { mtime: parseInt(d[1]), hash: d[2] });
      }
    }
    return out;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      logger.debug(`[hosting] hash cache [${name}] not populated`);
    } else {
      logger.debug(`[hosting] hash cache [${name}] load error: ${e.message}`);
    }
    return new Map<string, HashRecord>();
  }
}

/**
 * Dump puts the data specified into the cache named by `name`.
 */
export function dump(cwd: string, name: string, data: Map<string, HashRecord>): void {
  let st = "";
  let count = 0;
  for (const [path, d] of data) {
    count++;
    st += `${path},${d.mtime},${d.hash}\n`;
  }
  try {
    fs.outputFileSync(cachePath(cwd, name), st, { encoding: "utf8" });
    logger.debug(`[hosting] hash cache [${name}] stored for ${count} files`);
  } catch (e: any) {
    logger.debug(`[hosting] unable to store hash cache [${name}]: ${e.stack}`);
  }
}
