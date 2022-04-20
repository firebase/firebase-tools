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
